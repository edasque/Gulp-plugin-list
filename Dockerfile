FROM ubuntu
MAINTAINER Erik Dasque erik@frenchguys.com

# install required packages
RUN apt-get update
RUN apt-get install -y dialog git curl

# install nodejs
RUN curl -sL https://deb.nodesource.com/setup | bash ; apt-get install -y nodejs

RUN npm update -g

COPY . /src

# RUN apt-get install -y apt-utils
# RUN apt-get install -y python

# RUN cd /src; git clone https://github.com/edasque/Gulp-plugin-list
# RUN cd /src/Gulp-plugin-list ; npm install caterpillar-human caterpillar-filter cheerio colors commander config lodash npm progress request step

# RUN cd /src/Gulp-plugin-list ; npm install aws2js

# RUN cd /src/Gulp-plugin-list ; mv ../default.json config

# RUN cd /src/Gulp-plugin-list ; npm install

RUN cd /src; npm install
# run application
CMD cd /src ; node gulp-plugins-search.js --log-level 5
