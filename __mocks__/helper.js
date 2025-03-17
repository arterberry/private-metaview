// __mocks__/helper.js
// Mock implementation of helper.js functionality

const helperClickHandler = jest.fn().mockImplementation((button) => {
    const url = button.getAttribute('data-url');

    if (url && window.opener && !window.opener.closed) {
        // Set the URL in the parent window's input field
        const inputField = window.opener.document.getElementById('hlsUrl');
        if (inputField) {
            inputField.value = url;

            // Optionally trigger the play button
            const playButton = window.opener.document.getElementById('playVideo');
            if (playButton) {
                playButton.click();
            }

            // Close this helper window
            window.close();
        }
    }
});

// Initialize helper page
const initHelperPage = jest.fn().mockImplementation(() => {
    // Add click handlers to all common URL buttons
    const urlButtons = document.querySelectorAll('.common-url');
    urlButtons.forEach(button => {
        button.addEventListener('click', () => helperClickHandler(button));
    });
});

// Export the mocked functions
module.exports = {
    helperClickHandler,
    initHelperPage
};