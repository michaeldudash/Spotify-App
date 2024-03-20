var offset = '50';

const debounce = (func, delay) => {
    let debounceTimer;
    return function () {
      const context = this
      const args = arguments
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => func.apply(context, args), delay)
    }
}

// Load first fifty songs, add them to database, pass the total amount of songs to LoadRest()
var loadFirstFifty = debounce(function() {
    console.log('upload data called');
    var firstFifty = $.get('/library');
    firstFifty.done(function(data) {
        console.log(data);
    });
}, 1000);


$(document).ready(function () {
    $("#upload-data-button").on('click',loadFirstFifty);
});