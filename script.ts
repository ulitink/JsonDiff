///<reference path="./definitions/jquery.d.ts"/>

$(document).ready(function () {
    $("#leftJson").val('{ "a": { "b": 1 }, "c": 2, "d": [1,2] }');
    $("#rightJson").val('{ "a": { "b": 3 }, "c": 2, "d": [1,3] }');
    $("#showDiff").click((obj) => {
        var fromString = $("#leftJson").val();
        var toString = $("#rightJson").val();
        var diffHtml = buildDiffHtml(fromString, toString);
        $("#diffBody").html(diffHtml);
        attachToggleEvents();
    });
    attachToggleEvents();
});

enum DiffState {
    ADDED,
    DELETED,
    BOTH
}
class DiffNode {
    label:string;
    state:DiffState;
    children:Array<DiffNode>;

    constructor(label:string, state:DiffState, children:Array<DiffNode>) {
        this.label = label;
        this.state = state;
        this.children = children;
    }
}

function buildFromValue(label: string, value: any, state: DiffState): DiffNode {
    if ($.isArray(value)) {
        var children = (<Array<DiffNode>>value).map((e) => buildFromValue("", e, state));
        return new DiffNode(label, state, children);
    }
    else if ($.isPlainObject(value)) {
        var children:Array<DiffNode> = [];
        for (var prop in value) {
            children.push(buildFromValue(prop, value[prop], state));
        }
        return new DiffNode(label, state, children);
    }
    else {
        if (label) value = label + ": " + value;
        return new DiffNode(value, state, []);
    }
}

function buildFromSameNamedProperties(key:string, fromValue:any, toValue:any): DiffNode {
    var children = compareValues(fromValue, toValue);
    if (children.length == 1) {
        var child:DiffNode = children[0];
        if (child.children.length == 0) {
            if (child.label !== undefined) key = key + ": " + child.label;
            return new DiffNode(key, DiffState.BOTH, child.children);
        }
    }
    return new DiffNode(key, DiffState.BOTH, compareValues(fromValue, toValue));
}

function compareArrayElements(fromElements: Array<any>, toElements:Array<any>): Array<DiffNode> {
    var usedToIndices:Array<boolean> = [];
    var result:Array<DiffNode> = [];
    for (var iFrom in fromElements) {
        var maxSimilarity = 0;
        var iMaxSimilarity = -1;
        for (var iTo in toElements) {
            if (usedToIndices[iTo]) continue;
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
                diffNode = buildFromValue("", fromElement, DiffState.BOTH);
            }
            else {
                diffNode = new DiffNode("", DiffState.BOTH, compareValues(fromElement, toElements[iMaxSimilarity]));
            }
            result.push(diffNode);
        }
        else {
            result.push(buildFromValue("", fromElements[iFrom], DiffState.DELETED));
        }
    }
    for (var iTo in toElements) {
        if (usedToIndices[iTo]) continue;
        result.push(buildFromValue("", toElements[iTo], DiffState.ADDED));
    }
    return result;
}

/** @return number in [0, 1] */
function similarity(from:any, to:any): number {
    if ($.isPlainObject(from)) {
        if (!$.isPlainObject(to)) return 0;
        var keysNumber: number = 0;
        var commonKeys: number = 0;
        for (var fromKey in from) {
            keysNumber++;
            if (to.hasOwnProperty(fromKey)) commonKeys++;
        }
        return keysNumber > 0 ? commonKeys/keysNumber : 0;
    }
    else if ($.isArray(from)) {
        if (!$.isArray(to)) return 0;
        // current algorithm can assign different from elements to the same to element
        // valid is to find such assignment that similarity is max
        var accumulatedSimilarity = 0;
        for (var iFrom in from) {
            var maxSimilarity: number = 0;
            for (var iTo in to) {
                var currentSimilarity: number = similarity(from[iFrom], to[iTo]);
                maxSimilarity = Math.max(currentSimilarity, maxSimilarity);
            }
            accumulatedSimilarity += maxSimilarity;
        }
        return from.length > 0 ? accumulatedSimilarity / from.length : 0;
    }
    else {
        if ($.isPlainObject(to) || $.isArray(to)) return 0;
        return from === to ? 1 : 0;
    }
}

function compareValues(fromJSON: any, toJSON: any): Array<DiffNode> {
    var fromIsArray = $.isArray(fromJSON);
    var toIsArray = $.isArray(toJSON);
    var fromIsObject = $.isPlainObject(fromJSON);
    var toIsObject = $.isPlainObject(toJSON);
    if (fromIsArray && toIsArray) {
        return compareArrayElements(fromJSON, toJSON);
    }
    else if (fromIsObject && toIsObject) {
        var fromKeys = Object.keys(fromJSON).sort();
        var toKeys = Object.keys(toJSON).sort();
        var fromLength = fromKeys.length;
        var toLength = toKeys.length;
        var iFrom = 0, iTo = 0;
        var result:Array<DiffNode> = [];
        while (iFrom < fromLength || iTo < toLength) {
            var node:DiffNode;
            if (iTo >= toLength || iFrom < fromLength && fromKeys[iFrom] < toKeys[iTo]) {
                node = buildFromValue(fromKeys[iFrom], fromJSON[fromKeys[iFrom]], DiffState.DELETED);
                iFrom++;
            }
            else if (iFrom >= fromLength || iTo < toLength && fromKeys[iFrom] > toKeys[iTo]) {
                node = buildFromValue(toKeys[iTo], toJSON[toKeys[iTo]], DiffState.ADDED);
                iTo++;
            }
            else if (iFrom < fromLength && iTo < toLength && fromKeys[iFrom] === toKeys[iTo]) {
                var key = fromKeys[iFrom];
                var fromValue = fromJSON[key];
                var toValue = toJSON[key];
                node = buildFromSameNamedProperties(key, fromValue, toValue);
                iFrom++;
                iTo++;
            }
            else {
                throw new Error("unexpected error on comparing objects");
            }
            result.push(node);
        }
        return result;
    }
    else if (!fromIsArray && !toIsArray && !fromIsObject && !toIsObject && fromJSON === toJSON) {
        return [buildFromValue("", fromJSON, DiffState.BOTH)];
    }
    else {
        return [buildFromValue("", fromJSON, DiffState.DELETED), buildFromValue("", toJSON, DiffState.ADDED)];
    }

}

function compare(from:string, to:string): Array<DiffNode> {
    var fromJSON = JSON.parse(from);
    var toJSON = JSON.parse(to);

    return compareValues(fromJSON, toJSON);
}

function buildDiffHtml(from:string, to:string): string {
    var diffNodes:Array<DiffNode> = compare(from, to);
    return buildHtml(diffNodes);
}

function buildHtml(diff:Array<DiffNode>): string {
    var result = "";
    diff.forEach((e) => {
        var leaf = e.children.length == 0;
        var diffClass =
                e.state == DiffState.ADDED ? " added" :
                e.state == DiffState.DELETED ? " deleted" :
                "";
        if (leaf) {
            result += "<div class='diffLeaf" + diffClass + "'>" + e.label + "</div>\n";
        }
        else {
            result += "<div class='diffNode" + diffClass + "'>\n";
            result += "<div class='nodeLabel'><span class='arrow'>&#9662;</span>"  + e.label + "</div>\n";
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