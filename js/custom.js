// filepath: /Users/benjaminriot/Dropbox/personal/personalsite/brb/static/js/custom.js
document.addEventListener('DOMContentLoaded', () => {
  // Select all images on the page
  const images = document.querySelectorAll('img');

  images.forEach(img => {
    // Disable right-click context menu
    img.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // You could optionally alert the user:
      // alert('Image downloading is disabled.');
    });

    // Optional: Disable dragging (another common way to save images)
    img.addEventListener('dragstart', (event) => {
      event.preventDefault();
    });
  });
});