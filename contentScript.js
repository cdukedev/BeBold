let originalHTML = document.documentElement.innerHTML;
const currentURL = window.location.href;

// Define the LinkedIn messaging URL prefix
const linkedinMessagingURLPrefix = "https://www.linkedin.com/messaging/thread";

// Set the initial state to enabled if it hasn’t been set already
if (localStorage["extensionEnabled"] === undefined) {
  localStorage["extensionEnabled"] = "true";
}

// Check if the current URL starts with the LinkedIn messaging URL prefix
if (currentURL.startsWith(linkedinMessagingURLPrefix)) {
  console.log("Extension is disabled on LinkedIn Messaging.");
} else {
  function processTextNode(node) {
    let content = node.textContent;
    let words = content.split(/\s+/);

    //Only process if more than 50 words are in the text node
    if (words.length < 5) {
      return null;
    }

    let newHTML = words
      .map((word) => {
        let halfLength = Math.floor(word.length / 2);
        let firstHalf = word.slice(0, halfLength);
        let secondHalf = word.slice(halfLength);
        return `<strong id="custom-strong">${firstHalf}</strong><span id="custom-span">${secondHalf}</span>`;
      })
      .join(" ");

    return newHTML;
  }
  function isInsideList(node) {
    let currentNode = node.parentNode;
    while (currentNode) {
      if (
        currentNode.nodeName.toLowerCase() === "ul" ||
        currentNode.nodeName.toLowerCase() === "ol"
      ) {
        return true;
      }
      currentNode = currentNode.parentNode;
    }
    return false;
  }

  function hasRoleTextbox(node) {
    let currentNode = node;
    while (currentNode) {
      if (
        currentNode.getAttribute &&
        currentNode.getAttribute("role") === "textbox"
      ) {
        return true;
      }
      currentNode = currentNode.parentNode;
    }
    return false;
  }

  function traverseDOM(node) {
    // Check if node or its parent has role="textbox"
    if (hasRoleTextbox(node)) {
      return;
    }
    if (
      node.nodeName.toLowerCase() === "svg" ||
      node.nodeName.toLowerCase() === "li" ||
      node.nodeName.toLowerCase() === "h1" ||
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
      node.nodeName.toLowerCase() === "param"
    ) {
      return;
    }
    if (isInsideList(node)) {
      return;
    }

    // Handle text nodes
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent.trim().length > 0
    ) {
      let newContent = processTextNode(node);
      if (newContent && newContent !== "undefined") {
        let tempElement = document.createElement("div");
        tempElement.innerHTML = newContent;
        Array.from(tempElement.childNodes).forEach((newChild) => {
          node.parentNode.insertBefore(newChild, node);
        });
        node.parentNode.removeChild(node);
      }
      return;
    }

    // Recursively process children
    for (let i = 0; i < node.childNodes.length; i++) {
      traverseDOM(node.childNodes[i]);
    }
  }

  function applyChanges() {
    //add a timeout to allow the DOM to update
    setTimeout(() => {
      traverseDOM(document.body);
    }, 300);
  }

  function resetDOM() {
    document.documentElement.innerHTML = originalHTML;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggleExtension") {
      if (request.isEnabled) {
        localStorage["extensionEnabled"] = "true"; // Set the state to enabled
        applyChanges();
      } else {
        localStorage["extensionEnabled"] = "false"; // Set the state to disabled
        location.reload();
      }
    }
  });

  // Create a MutationObserver to watch for changes in the DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Check if it's an ELEMENT_NODE
          traverseDOM(node);
        }
      });
    });
  });

  // Start observing changes to the entire body of the document
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial pass to transform existing elements
  if (localStorage["extensionEnabled"] === "true") {
    applyChanges();
  }
}
