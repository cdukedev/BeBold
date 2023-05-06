let originalHTML = document.documentElement.innerHTML;

function processTextNode(node) {
  let content = node.textContent;
  let words = content.split(/\s+/);
  let newHTML = words
    .map((word) => {
      let halfLength = Math.ceil(word.length / 2);
      let firstHalf = word.slice(0, halfLength);
      let secondHalf = word.slice(halfLength);
      return `<strong style="color: inherit">${firstHalf}</strong>${secondHalf}`;
    })
    .join(" ");

  return newHTML;
}

function traverseDOM(node) {
  if (
    node.nodeName.toLowerCase() === "svg" ||
    node.nodeName.toLowerCase() === "script" ||
    node.nodeName.toLowerCase() === "style" ||
    node.nodeName.toLowerCase() === "noscript" ||
    node.nodeName.toLowerCase() === "iframe" ||
    node.nodeName.toLowerCase() === "canvas" ||
    node.nodeName.toLowerCase() === "video" ||
    node.nodeName.toLowerCase() === "audio" ||
    node.nodeName.toLowerCase() === "img" ||
    node.nodeName.toLowerCase() === "input" ||
    node.nodeName.toLowerCase() === "textarea" ||
    node.nodeName.toLowerCase() === "select" ||
    node.nodeName.toLowerCase() === "button" ||
    node.nodeName.toLowerCase() === "meter" ||
    node.nodeName.toLowerCase() === "progress" ||
    node.nodeName.toLowerCase() === "object" ||
    node.nodeName.toLowerCase() === "embed" ||
    node.nodeName.toLowerCase() === "applet" ||
    node.nodeName.toLowerCase() === "frame" ||
    node.nodeName.toLowerCase() === "frameset" ||
    node.nodeName.toLowerCase() === "map" ||
    node.nodeName.toLowerCase() === "param" ||
    node.nodeName.toLowerCase() === "area" ||
    node.nodeName.toLowerCase() === "link" ||
    node.nodeName.toLowerCase() === "base" ||
    node.nodeName.toLowerCase() === "meta" ||
    node.nodeName.toLowerCase() === "head" ||
    node.nodeName.toLowerCase() === "title" ||
    node.nodeName.toLowerCase() === "basefont" ||
    node.nodeName.toLowerCase() === "col" ||
    node.nodeName.toLowerCase() === "colgroup" ||
    node.nodeName.toLowerCase() === "frame" ||
    node.nodeName.toLowerCase() === "frameset" ||
    node.nodeName.toLowerCase() === "noframes" ||
    node.nodeName.toLowerCase() === "param" ||
    node.nodeName.toLowerCase() === "a"
  ) {
    return;
  }

  if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
    let newHTML = processTextNode(node);
    let tempElement = document.createElement("div");
    tempElement.innerHTML = newHTML;

    Array.from(tempElement.childNodes).forEach((childNode) => {
      node.parentNode.insertBefore(childNode, node);
    });
    node.parentNode.removeChild(node);
  } else {
    for (let child of Array.from(node.childNodes)) {
      traverseDOM(child);
    }
  }
}

function applyChanges() {
  traverseDOM(document.body);
}

function resetDOM() {
  document.documentElement.innerHTML = originalHTML;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleExtension") {
    if (request.isEnabled) {
      applyChanges();
    } else {
      resetDOM();
    }
  }
});

// Apply changes by default when the page loads
applyChanges();
