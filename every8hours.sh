#! /bin/bash
cd ~/Gulp-plugin-list
/bin/date >> gulp.plugins.log
/usr/bin/node gulp-plugins-search.js >> gulp.plugins.log