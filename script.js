///<reference path="./definitions/jquery.d.ts"/>
$(document).ready(function () {
    $("#leftJson").val('{ "a": { "b": 1 }, "c": 2, "d": [1,2] }');
    $("#rightJson").val('{ "a": { "b": 3 }, "c": 2, "d": [1,3] }');
    $("#showDiff").click(function (obj) {
        var fromString = $("#leftJson").val();
        var toString = $("#rightJson").val();
        var diffHtml = buildDiffHtml(fromString, toString);
        $("#diffBody").html(diffHtml);
        attachToggleEvents();
    });
    attachToggleEvents();
});

var DiffState;
(function (DiffState) {
    DiffState[DiffState["ADDED"] = 0] = "ADDED";
    DiffState[DiffState["DELETED"] = 1] = "DELETED";
    DiffState[DiffState["BOTH"] = 2] = "BOTH";
})(DiffState || (DiffState = {}));
var DiffNode = (function () {
    function DiffNode(label, state, children) {
        this.label = label;
        this.state = state;
        this.children = children;
    }
    return DiffNode;
})();

function buildFromValue(label, value, state) {
    if ($.isArray(value)) {
        var children = value.map(function (e) {
            return buildFromValue("", e, state);
        });
        return new DiffNode(label, state, children);
    } else if ($.isPlainObject(value)) {
        var children = [];
        for (var prop in value) {
            children.push(buildFromValue(prop, value[prop], state));
        }
        return new DiffNode(label, state, children);
    } else {
        if (label)
            value = label + ": " + value;
        return new DiffNode(value, state, []);
    }
}

function compareArrayElements(fromElements, toElements) {
    var usedToIndices = [];
    var result = [];
    for (var iFrom in fromElements) {
        var maxSimilarity = 0;
        var iMaxSimilarity = -1;
        for (var iTo in toElements) {
            if (usedToIndices[iTo])
                continue;
            var currentSimilarity = similarity(fromElements[iFrom], toElements[iTo]);
            if (currentSimilarity > maxSimilarity) {
                iMaxSimilarity = iTo;
                maxSimilarity = currentSimilarity;
            }
        }
        if (maxSimilarity > 0.5) {
            usedToIndices[iMaxSimilarity] = true;
            var fromElement = fromElements[iFrom];
            var diffNode;
            if (!$.isArray(fromElement) && !$.isPlainObject(fromElement)) {
                // assert fromElement == toElement && maxSimilarity == 1
                diffNode = buildFromValue("", fromElement, 2 /* BOTH */);
            } else {
                diffNode = new DiffNode("", 2 /* BOTH */, compareValues(fromElement, toElements[iMaxSimilarity]));
            }
            result.push(diffNode);
        } else {
            result.push(buildFromValue("", fromElements[iFrom], 1 /* DELETED */));
        }
    }
    for (var iTo in toElements) {
        if (usedToIndices[iTo])
            continue;
        result.push(buildFromValue("", toElements[iTo], 0 /* ADDED */));
    }
    return result;
}

/** @return number in [0, 1] */
function similarity(from, to) {
    if ($.isPlainObject(from)) {
        if (!$.isPlainObject(to))
            return 0;
        var keysNumber = 0;
        var commonKeys = 0;
        for (var fromKey in from) {
            keysNumber++;
            if (to[fromKey] != undefined)
                commonKeys++;
        }
        return keysNumber > 0 ? commonKeys / keysNumber : 0;
    } else if ($.isArray(from)) {
        if (!$.isArray(to))
            return 0;

        // current algorithm can assign different from elements to the same to element
        // valid is to find such assignment that similarity is max
        var accumulatedSimilarity = 0;
        for (var iFrom in from) {
            var maxSimilarity = 0;
            for (var iTo in to) {
                var currentSimilarity = similarity(from[iFrom], to[iTo]);
                maxSimilarity = Math.max(currentSimilarity, maxSimilarity);
            }
            accumulatedSimilarity += maxSimilarity;
        }
        return from.length > 0 ? accumulatedSimilarity / from.length : 0;
    } else {
        if ($.isPlainObject(to) || $.isArray(to))
            return 0;
        return from === to ? 1 : 0;
    }
}

function compareValues(fromJSON, toJSON) {
    var fromIsArray = $.isArray(fromJSON);
    var toIsArray = $.isArray(toJSON);
    var fromIsObject = $.isPlainObject(fromJSON);
    var toIsObject = $.isPlainObject(toJSON);
    if (fromIsArray && toIsArray) {
        return compareArrayElements(fromJSON, toJSON);
    } else if (fromIsObject && toIsObject) {
        var fromKeys = Object.keys(fromJSON).sort();
        var toKeys = Object.keys(toJSON).sort();
        var fromLength = fromKeys.length;
        var toLength = toKeys.length;
        var iFrom = 0, iTo = 0;
        var result = [];
        while (iFrom < fromLength || iTo < toLength) {
            if (iFrom < fromLength && iTo < toLength) {
                var node;
                if (fromKeys[iFrom] < toKeys[iTo]) {
                    node = buildFromValue(fromKeys[iFrom], fromJSON[fromKeys[iFrom]], 1 /* DELETED */);
                    iFrom++;
                } else if (fromKeys[iFrom] > toKeys[iTo]) {
                    node = buildFromValue(toKeys[iTo], toJSON[toKeys[iTo]], 0 /* ADDED */);
                    iTo++;
                } else if (fromKeys[iFrom] === toKeys[iTo]) {
                    var key = fromKeys[iFrom];
                    var fromValue = fromJSON[key];
                    var toValue = toJSON[key];
                    node = new DiffNode(key, 2 /* BOTH */, compareValues(fromValue, toValue));
                    iFrom++;
                    iTo++;
                }
            }
            result.push(node);
        }
        return result;
    } else if (!fromIsArray && !toIsArray && !fromIsObject && !toIsObject && fromJSON === toJSON) {
        return [buildFromValue("", fromJSON, 2 /* BOTH */)];
    } else {
        return [buildFromValue("", fromJSON, 1 /* DELETED */), buildFromValue("", fromJSON, 0 /* ADDED */)];
    }
}

function compare(from, to) {
    var fromJSON = JSON.parse(from);
    var toJSON = JSON.parse(to);

    return compareValues(fromJSON, toJSON);
}

function buildDiffHtml(from, to) {
    var diffNodes = compare(from, to);
    return buildHtml(diffNodes);
}

function buildHtml(diff) {
    var result = "";
    diff.forEach(function (e) {
        var leaf = e.children.length == 0;
        var diffClass = e.state == 0 /* ADDED */ ? " added" : e.state == 1 /* DELETED */ ? " deleted" : "";
        if (leaf) {
            result += "<div class='diffLeaf" + diffClass + "'>" + e.label + "</div>\n";
        } else {
            result += "<div class='diffNode" + diffClass + "'>\n";
            result += "<div class='nodeLabel'><span class='arrow'>&#9662;</span>" + e.label + "</div>\n";
            result += "<div class='nodeBody'>\n";
            result += buildHtml(e.children);
            result += "</div>\n"; // nodeBody
            result += "</div>\n"; // diffNode
        }
    });
    return result;
}

function attachToggleEvents() {
    $(".nodeLabel").click(function (obj) {
        var arrow = $(this).find(".arrow");
        arrow.html(arrow.html() == '&#9662;' ? '&#9656;' : '&#9662;');
        $(this).parent().find(".nodeBody").slideToggle(100);
    });
}
//# sourceMappingURL=script.js.map
