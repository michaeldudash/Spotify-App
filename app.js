// npm install express, request, cors, cookie-parser

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var mysql = require('mysql');
var bodyParser = require("body-parser");

var client_id = '<CLIENT ID>'; // Your client id
var client_secret = '<CLIENT SECRET>'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

//added to save access token
var a_token;

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function (length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

// app.use(bodyParser.json());

app.use(express.static(__dirname + '/public'))
  .use(cors())
  .use(cookieParser());

app.get('/login', function (req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope = 'user-read-private user-read-email user-library-read playlist-modify-public user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function (req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
          refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function (error, response, body) {
          console.log(body);
          a_token = access_token;
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function (req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

//Database

var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "<PASSWORD>",
  database: 'song_library'
});

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});

// Get user tracks
app.get('/library', async function (req, res) {

  console.log('**********************/library called');

  var url = 'https://api.spotify.com/v1/me/tracks?offset=6500&limit=50';

  while (url != (null || undefined)) {
    // Get 50 library tracks
    let getTrackRes = await getLibrarySelection(url);
    // console.log(getTrackRes);
    // post album info to album table
    let albumRes = await postAlbum(getTrackRes);
    // post track info to track table
    let trackRes = await postTrack(getTrackRes);
    // console.log(trackRes);
    // post artist info to artist table
    let artistRes = await postArtist(getTrackRes);

    // Set url to the next url and loop again
    url = getTrackRes.next;
  }

  let artistCount = await getArtistCount();
  let totArtists = artistCount[0].no_artists;

  for(let i=0;i<50;i+=50) {
    var num;
    if ((i+50)<totArtists) {
      num = 50;
    } else {
      num = totArtists-i;
    }
    let artistIds = await getArtistIds(num,i).catch(error => { console.log(error)});
    try {
      let artistDetails = await getArtistDetails(artistIds);
      // console.log(artistDetails.artists);
      await postArtistDetails(artistDetails.artists).catch(error => { console.log(error)});
      // console.log('i: ' + i);
      // console.log(artistDetails);
      for(let j=0;j<artistDetails.artists.length;j++) {
        // console.log('j: ' + j);
        for(let k=0;k<artistDetails.artists[j].genres.length;k++) {
          // console.log('k: ' + k);
          let b = await postArtistGenres(artistDetails.artists[j].id,artistDetails.artists[j].genres[k]).catch(error => {console.log(error)});
        }
      }
    } catch (error) {
      console.log(error);
    }
  }
  
  res.send('success');

});

// Get artist search results
app.get('/artists/search', async function (req, res) {

  let limit = req.query.limit;
  let offset = req.query.offset;
  let name = req.query.name;

  let artistSearchResults = await getArtistSearch(parseInt(limit),parseInt(offset),name).catch(error => (console.log(error)));

  try {
    console.log(artistSearchResults[0].id);
  } catch (error) {
    console.log(error);
  }

  // res.json({ body: artistSearchResults});
  res.send(artistSearchResults);

});

function getArtistSearch(limit, offset, name) {

  return new Promise(function (resolve, reject) {
    
    var query = "SELECT id, name FROM artist WHERE name LIKE concat('%', ?, '%') LIMIT ?, ?";
    con.query(query, [name, offset, limit],
      (err, result) => {
        if (err) {
          reject(err);
        } else {
          console.log(result[0]);
          console.log('****');
          resolve(result);
        }
      });

  });

}

// Get the current selection of user's library
function getLibrarySelection(url) {

  // Create URL for Spotify API call
  var options = {
    url: url,
    headers: { 'Authorization': 'Bearer ' + a_token },
    data: { 'async': 'false' },
    json: true
  }

  return new Promise(function (resolve, reject) {
    
    // Make request to get user tracks
    request.get(options, function (error, response, body) {

      // If request is successful
      if (!error && response.statusCode === 200) {
        resolve(body);

        // If there is an error with the request
      } else {
        reject(error);
      }
    });

  });
}

function getArtistIds(num,offset) {

  return new Promise(function(resolve,reject) {

    var query = "SELECT id FROM artist LIMIT ?, ?";
    con.query(query, [offset, num],
      (err,result) => {
        if (err) {
          reject(err);
        } else {
          resolve(Array.prototype.map.call(result, function(item) {
            return item.id
          }).join(",").toString());
        }
      }
    );

  });

}

function postArtistDetails(artists) {

  return new Promise(function(resolve,reject) {

      for (let i=0;i<artists.length;i++) {

        var query = "UPDATE artist SET popularity = ? WHERE id=?";
        con.query(query, [artists[i].popularity,artists[i].id,],
          (err,result) => {
            if (err) {
              console.log(err);
              reject(err);
            } else {
              // console.log('album successful');
              if ((i+1) == artists.length) {
                // console.log('detail successful');
                resolve(result);
              }
            }
          });
      }
  });

}

function postArtistGenres(artistId,genre) {

  return new Promise(function(resolve,reject) {
    var query = "INSERT IGNORE INTO artist_genres (artist_id, genre) VALUES (?, ?)";
    con.query(query, [artistId,genre],
      (err,result) => {
        if (err) {
          console.log('error');
          reject(err);
        } else {
          // console.log('genre successful');
          resolve(result);
        }
      });
  });

}

function getArtistDetails(ids) {

  var url = 'https://api.spotify.com/v1/artists?' + 
    querystring.stringify({
      'ids': ids
    });

  var options = {
    url: url,
    headers: { 'Authorization': 'Bearer ' + a_token },
    // data: { 'ids': ids },
    json: true
  }

  return new Promise(function (resolve, reject) {
  
    // Make request to get user tracks
    request.get(options, function (error, response, body) {

      // If request is successful
      if (!error && response.statusCode === 200) {
        resolve(body);

        // If there is an error with the request
      } else {
        console.log(response.statusCode);
        reject(error);
      }
    });

  });
}

function getArtistCount() {

  return new Promise(function(resolve, reject) {
    var query = "SELECT COUNT(id) AS no_artists FROM artist";
    con.query(query, 
      (err,result) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          resolve(result);
        }
      })
  });

}

// Post data to database

// Post results to album table
function postAlbum(body) {

  return new Promise(function (resolve, reject) {

    for (let i = 0; i < body.items.length; i++) {

      // Post results to album table
      var query = "INSERT IGNORE INTO album (id, name) VALUES (?, ?)";
      con.query(query, [body.items[i].track.album.id, body.items[i].track.album.name],
        (err, result) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            // console.log('album successful');
            if ((i+1) == body.items.length) {
              // console.log('album successful');
              resolve(result);
            }
          }
        }
      );
    
    }
  });
}

// Post results to track table
function postTrack(body) {

  return new Promise(function (resolve, reject) {

    for (let i = 0; i < body.items.length; i++) {

      // Post results to track table
      var query = "INSERT IGNORE INTO track (id, name, album_id, added_at) VALUES (?, ?, ?, ?)";
      con.query(query, [body.items[i].track.id, body.items[i].track.name, body.items[i].track.album.id, body.items[i].added_at], 
        (err, result) => {
          if (err) {
            console.log(err);
            reject(err);
          } else {
            if ((i+1) == body.items.length) {
              // console.log('track successful');
              resolve(result);
            }
          }
        }
      );
    
    }
  });
}

// Post results to artist table
function postArtist(body) {

  return new Promise(function (resolve, reject) {

    for (let i=0;i<body.items.length;i++) {

      for (let j=0;j<body.items[i].track.artists.length;j++) {

        var query = "INSERT IGNORE INTO artist (id, name) VALUES (?, ?)";
        con.query(query, [body.items[i].track.artists[j].id, body.items[i].track.artists[j].name],
          async function (err, result) {
            if (err) {
              console.log(err);
              reject(err);
            } else {
              // Post track to the artist_track table
              let artistTrackRes = await postArtistTrack(body.items[i].track.id,body.items[i].track.artists[j].id);
              if ((i+1 == body.items.length) && (j+1 == body.items[i].track.artists.length)) {
                // console.log('artist successful');
                resolve(result);
              }
            }
          });
      }
    }
  });
}

// Post to artist_tracks table
function postArtistTrack(track_id, artist_id) {

  return new Promise(function (resolve, reject) {

    var query = "INSERT IGNORE INTO artist_tracks (track_id, artist_id) VALUES (?, ?)";

    con.query(query, [track_id, artist_id],
      
      (err, result) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          resolve(result);
        }
      });

  });

}

console.log('Listening on 8888');
app.listen(8888);
