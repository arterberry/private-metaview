document.addEventListener('DOMContentLoaded', function() {

    const urlButtons = document.querySelectorAll('.common-url');
    urlButtons.forEach(button => {
        button.addEventListener('click', function() {
            const url = this.getAttribute('data-url');
            if (url && window.opener && !window.opener.closed) {

                const inputField = window.opener.document.getElementById('hlsUrl');
                if (inputField) {
                    inputField.value = url;
                    
                    const playButton = window.opener.document.getElementById('playVideo');
                    if (playButton) {
                        playButton.click();
                    }
                
                    window.close();
                }
            }
        });
    });
});