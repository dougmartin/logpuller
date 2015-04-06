var express = require('express'),
    app = express(),
    swig = require('swig'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    request = require('request'),
    cheerio = require('cheerio'),
    csv = require('csv'),
    getRemoteFormData,
    server,
    maxRows = 10000;

app.use(session({
  secret: 'no secrets here',
  resave: false,
  saveUninitialized: true
}));
app.use(bodyParser.urlencoded({
  extended: true
})); 

app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.set('port', (process.env.PORT || 5000));

//app.set('view cache', false);
swig.setDefaults({ cache: false });

getRemoteFormData = function (req, cb) {
  req.session.request.get('http://teaching-teamwork-log-manager.herokuapp.com/logs', function (err, response, body) {
    var $ = cheerio.load(body),
        applications = [],
        activities = [],
        noCaseSort = function (a, b) {
          return a.toLowerCase().localeCompare(b.toLowerCase());
        };
        
    if (response.statusCode == 200) {
      $('select#filter_application > option').each(function () {
        applications.push($(this).val());
      });
      $('select#filter_activity > option').each(function () {
        activities.push($(this).val());
      });
    }
    
    applications.sort(noCaseSort);
    activities.sort(noCaseSort);
    
    cb({
      applications: applications,
      activities: activities
    });
  });  
};

getCSRFToken = function (req, url, cb) {
  req.session.request.get(url, function (err, response, body) {
    var $ = cheerio.load(body),
        meta = $('meta'),
        keys = Object.keys(meta) || [],
        token = null;
        
    keys.forEach(function (key) {
      if (meta[key].attribs && meta[key].attribs.name && meta[key].attribs.name === 'csrf-token') {
        token = meta[key].attribs.content;
      }
    });

    if (token) {
      cb(null, token);
    }
    else {
      cb('Unable to find CSRF token');
    }
  });    
};

getSessionRequest = function (req) {
  if (!req.session.request) {
    req.session.request = sessionRequest = request.defaults({
      jar: true
    });
  }
  return req.session.request;
};

app.get('/', function (req, res) {
  var sendResponse = function (form) {
      },
      sessionRequest = getSessionRequest(req);
      
  res.render('index', {
    loggedIn: req.session.loggedIn,
    form: {}
  });
});

app.post('/', function (req, res) {
  var sendResponse = function (error) {
        res.render('index', {
          loggedIn: req.session.loggedIn,
          error: error || null,
          form: req.body
        });
      },
      sessionRequest = getSessionRequest(req);
      
  if (req.body.login) {
    // validate the info
    if (!req.body.email || !req.body.password) {
      sendResponse('Please enter both email and password');
      return;
    }
    
    sessionRequest.get('http://teaching-teamwork-log-manager.herokuapp.com/users/sign_in', function (err, response, body) {
      if (err || (response.statusCode != 200)) {
        sendResponse(err || "Unable to load log manager login page!");
        return;
      }
      
      var $ = cheerio.load(body),
          params = {
            utf8: $('input[name="utf8"]').val(),
            authenticity_token: $('input[name="authenticity_token"]').val(),
            'user[email]': req.body.email,
            'user[password]': req.body.password,
            'user[remember_me]': "0",
            commit: 'Sign in'
          };
      sessionRequest
        .post({url: 'http://teaching-teamwork-log-manager.herokuapp.com/users/sign_in', form: params}, function (err, response2, body2) {
          if (response2.statusCode == 302) {
            req.session.loggedIn = true;
            res.redirect('/');
          }
          else if (response2.statusCode == 200) {
            sendResponse('Invalid email or password');
          }
          else {
            sendResponse(err || 'Unknown error occured trying to login');
          }
        });
    });
  }
  else if (req.body.logout) {
    req.session.destroy(function(err) {
      res.redirect('/');
    })
  }
  else {
    res.redirect('/');
  }
});


app.get('/using-form-fields', function (req, res) {
  var sendResponse = function (form) {
        res.render('using-form-fields', {
          loggedIn: req.session.loggedIn,
          maxRows: maxRows,
          form: form || {}
        });
      },
      sessionRequest = getSessionRequest(req);
      
  if (req.session.loggedIn) {
    getRemoteFormData(req, sendResponse);
  }
  else {
    res.redirect('/');
  }
});

app.post('/using-form-fields', function (req, res) {
  var sendResponse = function (error) {
        if (error) {
          getRemoteFormData(req, function (formData) {
            req.body.applications = formData.applications;
            req.body.activities = formData.activities;
            
            res.render('using-form-fields', {
              loggedIn: req.session.loggedIn,
              error: error || null,
              maxRows: maxRows,
              form: req.body
            });
          });
        }
        else {
          res.render('using-form-fields', {
            loggedIn: req.session.loggedIn,
            maxRows: maxRows,
            form: req.body
          });
        }
      },
      sessionRequest = getSessionRequest(req);
      
  if (!req.session.loggedIn) {
    res.redirect('/');
    return;
  }
  
  url = [
    'http://teaching-teamwork-log-manager.herokuapp.com/logs.json?sEcho=6&iColumns=9&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C',
    '&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=false&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=false&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=false&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1',
    '&applicationName=', encodeURIComponent(req.body.filter_application || ''),
    '&activityName=', encodeURIComponent(req.body.filter_activity || ''),
    '&timeZone=', encodeURIComponent(req.body.filter_time_zone || ''),
    '&startPeriod=', encodeURIComponent(req.body.start_period || ''),
    '&endPeriod=', encodeURIComponent(req.body.end_period || ''),
    '&sSearch=', encodeURIComponent(req.body.search || ''),
    '&iDisplayStart=0',
    '&iDisplayLength='
  ].join('');
  sessionRequest.get(url + '1', function (err, response, body) {
    if (err || (response.statusCode != 200)) {
      sendResponse(err || "Unable to load initial json.logs!");
      return;
    }
    
    var parsedBody = JSON.parse(body);
    
    if (!parsedBody.hasOwnProperty('iTotalDisplayRecords')) {
      sendResponse('Could not find total number of records in initial response');
      return;
    }
    
    if (parsedBody.iTotalDisplayRecords > maxRows) {
      sendResponse('Sorry, the requested number of records (' + parsedBody.iTotalDisplayRecords + ') is more than the max of ' + maxRows + '.  Please narrow your search.');
      return;
    }
    
    sessionRequest.get(url + parsedBody.iTotalDisplayRecords, function (err, response2, body2) {
      if (err || (response.statusCode != 200)) {
        sendResponse(err || "Unable to load secondary json.logs!");
        return;
      }
      
      var parsedBody2 = JSON.parse(body2),
          forEachRow = function (callback) {
            var result;
            for (var i = 0; i < parsedBody2.aaData.length; i++) {
              result = callback(parsedBody2.aaData[i], i);
              if (result === false) {
                 break;
              }
            }
            return result;
          },
          parseData = function (data) {
            data = data.replace(/^\s+|\s+$/, '').replace(/=>/g, ':').replace(/\:nil/g, ':null');
            if (data.length === 0) {
              return '';
            }
            try {
              return JSON.parse(data);
            }
            catch (e) {
              sendResponse("Unable to parse: " + data);
              return false;
            }
          };
      
      // find all the parameters and extras
      var parameterSet = {},
          extraSet = {},
          parameterIndex = 6,
          extraIndex = 7;
      if (false === forEachRow(function (row) {
        row[parameterIndex] = parseData(row[parameterIndex]);
        if (row[parameterIndex] === false) {
          return false;
        }
        for (var key in row[parameterIndex]) {
          parameterSet[key] = true;
        }

        row[extraIndex] = parseData(row[extraIndex]);
        if (row[extraIndex] === false) {
          return false;
        }
        for (var key in row[extraIndex]) {
          extraSet[key] = true;
        }
      })) {
        return;
      }

      // build the header
      var header = ['Session', 'Username', 'Application', 'Activity', 'Event', 'Time', 'Event Value'];
      for (var col in parameterSet) {
        header.push(col);
      }
      for (col in extraSet) {
        header.push(col);
      }
      
      // unroll the parameters and extras
      forEachRow(function (row) {
        // add in the parameters and extras as columns
        for (var key in parameterSet) {
          row.push(row[parameterIndex].hasOwnProperty(key) ? row[parameterIndex][key] : '');
        }
        for (key in extraSet) {
          row.push(row[extraIndex].hasOwnProperty(key) ? row[extraIndex][key] : '');
        }
        
        // remove the parameters and extras objects
        row.splice(parameterIndex, 2);
      });
      
      if (req.body.format === 'dat') {
        res.setHeader('Content-disposition', 'attachment; filename=log.dat');
        res.setHeader('Content-type', 'text/dat');
        res.write(header.join('\t'));
        res.write('\n');
        for (var i = 0; i < parsedBody2.aaData.length; i++) {
          res.write(parsedBody2.aaData[i].join('\t'));
          res.write('\n');
        }
        res.end();
      }
      else {
        parsedBody2.aaData.unshift(header);
        csv.stringify(parsedBody2.aaData, function (err, csvData) {
          res.setHeader('Content-disposition', 'attachment; filename=log.csv');
          res.setHeader('Content-type', 'text/csv');
          res.end(csvData);
        });
      }
    });
  });
});


app.get('/using-json', function (req, res) {
  var sessionRequest = getSessionRequest(req);
      
  if (!req.session.loggedIn) {
    res.redirect('/');
  }
  else {
    res.render('using-json', {
      loggedIn: req.session.loggedIn
    });
  }
});

app.post('/using-json', function (req, res) {
  var sendResponse = function (error) {
        res.render('using-json', {
          error: error || null,
          loggedIn: req.session.loggedIn,
          form: req.body
        });
      },
      sessionRequest = getSessionRequest(req);
      
  if (!req.session.loggedIn) {
    res.redirect('/');
    return;
  }
  
  getCSRFToken(req, 'http://teaching-teamwork-log-manager.herokuapp.com/data_interactive/index', function (csrfErr, csrfToken) {
    if (csrfErr) {
      sendResponse(csrfErr);
      return;
    }
  
    options = {
      url: 'http://teaching-teamwork-log-manager.herokuapp.com/table_transform',
      headers: {
        'X-CSRF-Token': csrfToken,
        'X-Requested-With': 'XMLHttpRequest'
      },
      form: {
        'json-textarea': (req.body.json || ''),
        'query-name': ''
      }
    };
    
    sessionRequest.post(options, function (err, response, body) {
      if (err || (response.statusCode != 200)) {
        sendResponse(err || 'Unable to load json!  Error ' + response.statusCode);
        return;
      }
      
      var parsedBody = JSON.parse(body);
      if (!parsedBody.template) {
        sendResponse('Unable to find template in returned json!');
        return;
      }
      
      var values = parsedBody.values || [];
      
      if (req.body.format === 'dat') {
        res.setHeader('Content-disposition', 'attachment; filename=json-log.dat');
        res.setHeader('Content-type', 'text/dat');
        res.write(parsedBody.template.join('\t'));
        res.write('\n');
        for (var i = 0; i < values.length; i++) {
          res.write(values[i].join('\t'));
          res.write('\n');
        }
        res.end();
      }
      else {
        values.unshift(parsedBody.template);
        csv.stringify(values, function (err, csvData) {
          res.setHeader('Content-disposition', 'attachment; filename=json-log.csv');
          res.setHeader('Content-type', 'text/csv');
          res.end(csvData);
        });
      }
    });
  });
  
});

server = app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});