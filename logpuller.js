var express = require('express'),
    app = express(),
    swig = require('swig'),
    session = require('express-session'),
    bodyParser = require('body-parser'),
    request = require('request'),
    cheerio = require('cheerio'),
    csv = require('csv');

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

//app.set('view cache', false);
swig.setDefaults({ cache: false });

app.get('/', function (req, res) {
  res.render('index', {
    loggedIn: req.session.loggedIn
  });
});

app.post('/', function (req, res) {
  var sendResponse = function (error) {
        res.render('index', {
          loggedIn: req.session.loggedIn,
          error: error || null
        });
      },
      sessionRequest = req.session.request;
      
  // keep a request object per session to hold the cookie jar
  if (!sessionRequest) {
    sessionRequest = request.defaults({
      jar: true
    });
  }
  
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
      
      $ = cheerio.load(body);
      var params = {
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
        error = 'Could not find total number of records in initial response';
        sendResponse();
        return;
      }
      
      sessionRequest.get(url + parsedBody.iTotalDisplayRecords, function (err, response2, body2) {
        if (err || (response.statusCode != 200)) {
          error = err || "Unable to load secondary json.logs!"; 
          sendResponse();
          return;
        }
        
        var parsedBody2 = JSON.parse(body2);
        parsedBody2.aaData.unshift(['Session', 'Username', 'Application', 'Activity', 'Event', 'Time', 'Parameters', 'Extras', 'Event Value']);
        csv.stringify(parsedBody2.aaData, function (err, csvData) {
          res.setHeader('Content-disposition', 'attachment; filename=log.csv');
          res.setHeader('Content-type', 'text/csv');
          res.end(csvData);
        });
      });
    });
  }
});

var server = app.listen(80)