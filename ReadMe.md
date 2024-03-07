# BeBold Extension
BeBold is a browser extension designed to enhance reading comprehension for individuals with ADHD (Attention Deficit Hyperactivity Disorder). It achieves this by bolding the first half of each word on a webpage, providing a unique reading style that helps users to concentrate better on the text.

## What I Learned
Throughout the process of creating the BeBold extension, I learned the following:

- How to create a browser extension from scratch.
- The importance of manifest files in defining the extension's structure and behavior.
- How to create and apply content scripts to modify web content.
- The process of traversing and manipulating the DOM (Document Object Model).
- How to consider the unique cognitive needs of individuals with ADHD and develop a solution tailored to their requirements.

## How to Fork and Use the Extension Locally
If you would like to use the BeBold extension locally on your computer or contribute to the project, follow these steps:

1. Fork the repository: Click the "Fork" button at the top-right corner of the original repository to create a copy of the project under your own GitHub account.
2. Clone the forked repository: Clone the repository to your local machine by running the following command in your terminal or command prompt:

    ```bash
    git clone https://github.com/{YourUserName}/BeBold.git
    ```

### Load the extension in your browser:
- **Google Chrome:**
  1. Compress the BeBold directory into a .zip file.
  2. Open Chrome and navigate to `chrome://extensions/`.
  3. Enable "Developer mode" by toggling the switch in the top-right corner.
  4. Click the "Load unpacked" button and select the BeBold directory from your local machine.
  5. The BeBold extension should now be installed and ready for use in your browser. Test it out by visiting any webpage and observing the bolded text.

Feel free to make any improvements to the extension or submit pull requests with your changes. Your contributions are greatly appreciated!

## Contributing to the Project
If you wish to contribute to the project, please follow these steps to ensure a smooth workflow:

1. **Create a New Branch:**
   - Switch to your local copy of the repository.
   - Create a new branch for your feature or fix using:
     ```bash
     git checkout -b feature-branch-name
     ```
2. **Make Your Changes:**
   - Work on your local branch and make the changes you deem necessary.
   - Test the application thoroughly to ensure your changes work as expected without breaking other functionalities.

3. **Merge the Main Branch into Your Branch:**
   - Before submitting a pull request, merge the main branch with your branch to ensure that your changes are compatible with the main project. This can be done by:
     ```bash
     git checkout main
     git pull origin main
     git checkout feature-branch-name
     git merge main
     ```
   - Resolve any merge conflicts and test again to make sure everything works correctly.

4. **Push Your Changes:**
   - Once you are satisfied with your changes and have tested everything, push your branch to GitHub:
     ```bash
     git push origin feature-branch-name
     ```

5. **Create a Pull Request:**
   - Go to the original repository on GitHub.
   - Click on the 'Pull Requests' tab and then the 'New pull request' button.
   - Select your feature branch and compare it with the main branch of the original repository.
   - Fill in the pull request template with all the relevant information about your changes.
   - Submit your pull request.

Please ensure your code is well-documented and adheres to the project's code style and conventions. All contributions are subject to review and approval by the project maintainers.


