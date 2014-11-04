"use strict";

var npm = require("npm")
var request = require("request")
var fs = require("fs")
var program = require('commander');
var Step = require('step');
var config = require('config');
var cheerio = require("cheerio");
var _ = require('lodash');

var ProgressBar = require('progress');
var bar;

// TODO: switch to use the official Amazon node.js AWS SDK
// var AWS = require('aws-sdk');

var aws = require("aws2js");

program.version('0.0.2').option('-ll, --log-level <l>', 'Set the log level', 5).parse(process.argv);

var level = program.logLevel

var colors = require('colors');

// if there is a -d flag in the parameters, we'll display every log entry
// otherwise, we'll not display 'debug'

// var level = process.argv.indexOf('-d') === -1 ? 6 : 7;
var logger = new(require('caterpillar').Logger)({
  level: level
});
var filter = new(require('caterpillar-filter').Filter)();
var human = new(require('caterpillar-human').Human)();

logger.pipe(filter).pipe(human).pipe(process.stdout);

logger.log('info', "Logger level:", logger.config.level, "(", logger.getLevelName(parseInt(level)), ")")

if (level == 7) {
  logger.pipe(require('fs').createWriteStream('/tmp/_debug.log'));
}

var github_config = config.get('github_config');

logger.log("info", "Configuration parameters:")
logger.log("info", github_config);

if (!((github_config.github_token))) {
  logger.log("error", "This application requires the config.json config file that defines github_token")
  process.reallyExit();
}

var s3 = aws.load('s3');
var s3_config = config.get('s3_config');

s3.setCredentials(s3_config.accessKeyId, s3_config.secretAccessKey);
s3.setBucket(s3_config.bucket);


var Blacklist = {};
var github_url;

var catalog = [];

// github.com regexp to isolate org & repo name
var gh = /.*github.com\/(.*\/.*)/

var npm_search_terms = ["gulpplugin"];
var npm_search_terms2 = ["gulpfriendly"];

// Reference: 'gulp-shell' is blacklisted

var Gulp_Blacklist_URL = "https://raw.githubusercontent.com/gulpjs/plugins/master/src/blackList.json"

// Go get the blacklist then search for the plugins in NPM
fetchBlacklist(searchGulpPlugins);

function fetchBlacklist(callback) {
  logger.log("notice", "Loading the blacklist");
  // Getting the Blacklist from gupjs blacklist json document
  /* Looks like so:
    {
      "gulp-blink": "use the `blink` module directly",
      "gulp-clean": "use the `del` module",
      "gulp-rimraf": "use the `del` module",
      ...
  */

  request(Gulp_Blacklist_URL, function(err, response, body) {
    if (err) {
      logger.log("error", "Issue retrieving the blacklist");
      console.error(err)
      process.exit(1);

    } else {
      Blacklist = JSON.parse(body);
      logger.log("notice", "Loaded the blacklist:", Object.keys(Blacklist).length, " items");

      // npm.load() must be called before any other function call
      npm.load({}, callback)
    }
  })
}

// If the module has an entry in the blacklist, return true, otherwise, return true
function isBlacklisted(plugin_name) {
  return (!!Blacklist[plugin_name])
}

// once npm has loaded, search the npm directory for plugins that match the npm_search_terms, silently
function searchGulpPlugins() {

  npm.commands.search(npm_search_terms, true, null,
    function(err, search1) {
      logger.log("notice", "Ran npm search for: ", npm_search_terms);
      if (err) {
        logger.log("error", "Error running search for " + npm_search_terms);
        console.error(err);
      } else {
        logger.log("notice", "Search for ", npm_search_terms, " returned ", Object.keys(search1).length, " items");

        npm.commands.search(npm_search_terms2, true, null,
          function(err2, search2) {
            logger.log("notice", "Ran npm search for: ", npm_search_terms2);
            if (err) {
              logger.log("error", "Error running search for " + npm_search_terms2);
              console.error(err);
            } else {
              logger.log("notice", "Search for ", npm_search_terms2, " returned ", Object.keys(search2).length, " items");

              var combined_search = _.merge(search1, search2);

              logger.log("notice", "Combined search for ", _.union(npm_search_terms, npm_search_terms2), " returned ", Object.keys(combined_search).length, " items");

              dumpResults(combined_search);
            }
          });

      }
    });

  function dumpResults(searchResults) {


    /* Looks like this this, a big object, one property per package. Might be a good idea to make an array of it

        { 'amd-optimize':
           { name: 'amd-optimize',
             description: 'An AMD (i.e. RequireJS) optimizer that\'s stream-friendly. Made for gulp. (WIP)',
             maintainers: [ '=normanrz' ],
             url: null,
             keywords: [ 'gulpplugin', 'gulpfriendly' ],
             version: '0.2.5',
             time: '2014-09-16 ',
             words: 'amd-optimize an amd (i.e. requirejs) optimizer that\'s stream-friendly. made for gulp. (wip) =normanrz gulpplugin gulpfriendly' },
          closurify:
           { name: 'closurify',
             description: 'Translates AMD modules to closure compiler format',
             maintainers: [ '=evindor' ],

      */

    // this will hold the Github repo URL that we figure out for each entry in the search
    logger.log("notice", "Search for ", npm_search_terms, " returned ", Object.keys(searchResults).length, " items");
    bar = new ProgressBar('Progress'.blue + ' :bar :percent :current/:total :etas', {
      complete: '⦿',
      incomplete: ' ',
      width: 40,
      total: Object.keys(searchResults).length
    });

    Step(function forAllResults() {
        var group = this.group();

        // for each search result
        for (var packagename in searchResults) {
          searchResults[packagename].blacklisted = isBlacklisted(packagename);
          ready_npm_view_call(searchResults[packagename], group());

        }
      },
      function processResults(err_multi, process_results) {
        if (err_multi) {
          console.log("Errors:")
          console.dir(err_multi)
          process.exit(1)
        } else {
          console.log("\n");
          logger.log("notice", "Processed", Object.keys(process_results).length, "items for ", npm_search_terms, "search");

          var s3buffer = new Buffer("process_gulp_plugins" + "(" + JSON.stringify(process_results, null, 4) + ");", "utf-8");
          //var s3buffer = new Buffer(JSON.stringify(process_results, null, 4), "utf-8");

          logger.log("notice", "Uploading document to S3");
          s3.putBuffer("gulp-plugins.jsonp", s3buffer, false, {
            'content-type': 'text/javascript'
          }, this);
        }
      },
      function confirmUpload(uploadError, final) {
        if (uploadError) {
          console.log(uploadError.message);
          sendMe(uploadError.name, uploadError.message);
          throw uploadError;
        } else {
          logger.log("notice", "Successfully uploaded document to S3");
          if (logger.config.level == 6) console.dir(final)
        }

      }



    );


  }

}

function grab_extra_npm_info(npm_package, callback) {
  request({
    url: npm_package.links.npm,
    headers: {
      'User-Agent': 'request'
    }
  }, function(err, response, body) {
    if (err) {
      logger.log("notice", "Issue retrieving npm web site info for ", npm_package.name, " at ", npm_package.links.npm);
      console.error(err)
      process.exit(1);

    } else if (response.statusCode != 200) {
      logger.log("info", "Issue retrieving npm web site info for ", npm_package.name, " at ", npm_package.links.npm);
      logger.log("info", "Response code was: ", response.statusCode);

      // callback(null, npm_package)
      build_with_npm_view(npm_package, callback)

    } else {
      logger.log("info", "Retrieved github repo info (", body.length, ") for ", npm_package.name, " at ", npm_package.links.npm);

      var $ = cheerio.load(body);

      var the_right_index = $('.downloads td').length - 2;

      npm_package.downloads_this_month = parseInt($('.downloads td').eq(the_right_index).text().replace(/ /g, ''));

      logger.log("info", "npm_package.downloads_this_month:", npm_package.downloads_this_month);

      // callback(null, npm_package)
      build_with_npm_view(npm_package, callback)

      // if (package_obj.name === "gulp-jsfuck") console.dir(package_obj)

    }
  });

}


function ready_npm_view_call(npm_package, callback) {
  var packagename = npm_package.name;

  logger.log("debug", "ready_npm_view_call:" + packagename);
  // for readability

  // if there is a list of maintainers, get a comma separated list, removing the '=' strings
  npm_package.author = npm_package.maintainers ? npm_package.maintainers.toString().replace(/=/g, "") : "N/A";

  // create the links object that contains one element, npm, built from the packagename
  npm_package.links = {
    npm: "https://www.npmjs.org/package/" + packagename
  };

  // created an IIFE here to carry the package object into the closure
  // if (packagename == "gulp-shell") console.dir(npm_package);

  // for each search result, call npm.view to more metadata about the package, including github repo
  // this is supposed to be silent
  // build_with_npm_view(npm_package, callback)
  grab_extra_npm_info(npm_package, callback);

}

function build_with_npm_view(npm_package, callback) {

  npm.commands.view([npm_package.name], true, function(view_err, view_data) {
    // instead of looking up the info for the same version as npm.search, I use the first version in npm.view
    // it shouldn't make a difference since I am only looking for the latest version that wouldn't change


    var first_key = Object.keys(view_data)[0];

    // if ((!view_err) && (npm_package.name == "gulp-shell")) console.dir(npm_package);

    if (view_err) {
      logger.log("error", "npm view for ", npm_package.name, " returned an error");
      console.error(view_err);
      callback(null, null)
      bar.tick();

    } else if ((view_data[first_key].homepage) && (~(view_data[first_key].homepage.indexOf("github.com")))) {
      npm_package.homepage = view_data[first_key].homepage.toLowerCase();

      // exec is for regexp, don't forget.
      npm_package.github_repo = gh.exec(npm_package.homepage)[1]

      lookup_repo_info(npm_package, callback);
    } else if (view_data[first_key].repository) {

      if (view_data[first_key].repository.type && view_data[first_key].repository.type == "git" && view_data[first_key].repository.url) {
        var github_matching = gh.exec(view_data[first_key].repository.url)
        if (github_matching && github_matching[1]) {

          npm_package.github_repo = github_matching[1].replace(".git", "")
          // if (package_obj.name === "gulp-jsfuck") console.dir(github_matching)

          logger.log("info", npm_package.name, " matched github: ", npm_package.github_repo)

          lookup_repo_info(npm_package, callback);

        } else {

          logger.log("info", "No github match for: ", npm_package.name);
          if (logger.config.level == 7) console.dir(view_data[first_key].repository);
          callback(null, npm_package);
          bar.tick();

        }
      } else {
        logger.log("info", "No repository type (or not git) or url for: ", npm_package.name);
        if (logger.config.level == 7) console.dir(view_data[first_key].repository);
        callback(null, npm_package);
        bar.tick();
      }

    } else {
      logger.log("info", npm_package.name, ": couldn't figure out a repo");
      if (~JSON.stringify(view_data[first_key]).indexOf("github")) {
        logger.log("info", "But it has github somewhere in there");
        if (logger.config.level == 7) console.dir(view_data[first_key]);
      }
      callback(null, npm_package);
      bar.tick();

    }
  });
}

function lookup_repo_info(npm_package, callback) {
  github_url = "https://api.github.com/repos/" + npm_package.github_repo + "?access_token=" + github_config.github_token;

  request({
    url: github_url,
    headers: {
      'User-Agent': 'request'
    }
  }, function(err, response, body) {
    if (err) {
      logger.log("notice", "Issue retrieving github repo info for ", npm_package.github_repo, " at ", github_url);
      console.error(err)
      process.exit(1);

    } else if (response.statusCode != 200) {
      logger.log("info", "Issue retrieving github repo info for ", npm_package.github_repo, " at ", github_url);
      logger.log("info", "Response code was: ", response.statusCode);
      logger.log("info", body);

      bar.tick();

      callback(null, npm_package)

    } else {
      var github_repo_info = JSON.parse(body);
      logger.log("debug", "Retrieved github repo info (", body.length, ") for ", npm_package.name, " at ", github_url);
      logger.log("info", github_repo_info.stargazers_count, " Stars & ", github_repo_info.forks, " forks");

      npm_package.github_stars = github_repo_info.stargazers_count;
      npm_package.github_forks = github_repo_info.forks;

      bar.tick();
      callback(null, npm_package)

      // if (package_obj.name === "gulp-jsfuck") console.dir(package_obj)

    }
  });
}