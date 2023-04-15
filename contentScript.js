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

traverseDOM(document.body);
