document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("toggleButton");
  let isEnabled = true;

  toggleButton.addEventListener("click", () => {
    isEnabled = !isEnabled;
    toggleButton.textContent = isEnabled ? "Turn Off" : "Turn On";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleExtension",
        isEnabled: isEnabled,
      });
    });
  });
});
