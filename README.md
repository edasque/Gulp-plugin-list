Gulp-plugin-list
================

Grabs the list of gulp plugins from npm, marks some as blacklisted, fetches github repo information and npm.org download # then uploads the content to [a jsonp file](https://s3.amazonaws.com/bunchofjson/gulp-plugins.jsonp)

```node gulp-plugins-search.js --log-level 5```

The only setup really is to create a default.json config file that mimics https://github.com/edasque/Gulp-plugin-list/blob/master/config/example_default.json

You’ll need a github token (anonymous access doesn’t give you enough ops per hour to query the info for all plugins) : https://help.github.com/articles/creating-an-access-token-for-command-line-use/

And an S3 bucket, key & secret key for S3 since this is where I’ve chosen to upload the JSONP file.

I have added an experimental Dockerfile for ease of use.
