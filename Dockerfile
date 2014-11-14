FROM ubuntu
MAINTAINER Erik Dasque erik@frenchguys.com

# install required packages
RUN apt-get update
RUN apt-get install -y wget dialog git

# install nodejs
RUN wget http://node-arm.herokuapp.com/node_latest_armhf.deb
RUN dpkg -i node_latest_armhf.deb

RUN npm update -g

COPY . /src
RUN apt-get install -y apt-utils
RUN apt-get install -y python
RUN cd /src; git clone https://github.com/edasque/Gulp-plugin-list
RUN cd /src/Gulp-plugin-list ; npm install caterpillar-human caterpillar-filter cheerio colors commander config lodash npm progress request step
RUN cd /src/Gulp-plugin-list ; npm install aws2js
RUN cd /src/Gulp-plugin-list ; mv ../default.json config
# RUN cd /src; npm install

# run application
CMD cd /src/Gulp-plugin-list ; node gulp-plugins-search.js
