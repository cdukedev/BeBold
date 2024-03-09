let originalHTML = document.documentElement.innerHTML;

// Set the initial state to enabled if it hasn’t been set already
if (localStorage["extensionEnabled"] === undefined) {
  localStorage["extensionEnabled"] = "true";
}

// ignoredSites is a mapping of site names to their URLs. If the current URL starts with
// any of the ignored sites, then the extension is disabled.
const disabledSites = [
   "https://www.linkedin.com/messaging/thread",
]
const isDisabledSite = disabledSites.some((site) => window.location.href.startsWith(site))

if (isDisabledSite) {
  console.log(`Extension is disabled on ${isIgnoredSite}`);
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
    let skipList = ["svg", "li", "h1", "script", "style", "noscript",
      "iframe", "canvas", "video", "audio", "img", "input", "textarea",
      "select", "button", "meter", "progress", "object", "embed", "applet",
      "frame", "frameset", "map", "param", "area", "link", "base", "meta",
      "head", "title", "basefont", "col", "colgroup", "frame", "frameset",
      "noframes", "param"];
    if (skipList.includes(node.nodeName.toLowerCase())) {
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
