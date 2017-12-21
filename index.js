'use strict';

const { isString, isEmpty } = require('lodash');
const fetch = require('isomorphic-fetch');
const cheerio = require('cheerio')

// consts

const HTTP_CLIENT = 'HTTP_CLIENT';
const RAE_OFFICIAL_HTTP_ENDPOINT = 'http://dle.rae.es/srv/';
const RAE_SEARCH_ACTION = 'search?w=';
const RAE_FETCH_ACTION = 'fetch?id=';

// http errors

const NotFoundError = (word) => new Error(`"${word}" not found in RAE`);

const NotValidWordError = (word) =>
  new Error(`"${word}" word param provided must be a valid string`);

const ParserError = (error) =>
  new Error(`"${error.message}" parser error found. Please raise an issue at https://github.com/Tsur/node-rae/issues`);

const NoChallengeScriptFoundError = () =>
  new Error('No challenge SCRIPT found!, It is possible due to RAE updated its API. Please raise an issue at https://github.com/Tsur/node-rae/issues');

// utils

const wordRegex = /^[a-zñáéíóúü]+$/i;

const isAWord = word =>
    isString(word) && !isEmpty(word) && wordRegex.test(word);

const toFormData = obj =>
    Object.keys(obj)
      .map( key =>
        `${key}=${obj[key]}`)
      .join('&');

// parser

function parseAuth(domAsString) {
  const formData = {};
  return (resolve, reject) => {
    try {
      const $ = cheerio.load(domAsString);
      const crc = $('script')
        .eq(1)
        .html();
      if (!crc) throw NoChallengeScriptFoundError();
      const challengeScriptPosition = crc.indexOf('function challenge()');
      if (challengeScriptPosition < 0) throw NoChallengeScriptFoundError();
      const oohhMyRaeFriendthatsAnEasyChallengeHaHa = new Function(`return ${crc
        .substr(challengeScriptPosition)
        .replace('document.forms[0].elements[1].value=', 'return ')}`)();
      const challengeCode = oohhMyRaeFriendthatsAnEasyChallengeHaHa();
      $('body input').each((i, el) => {
        formData[$(el).attr('name')] = $(el).attr('value') || challengeCode;
      });
      resolve(formData);
    } catch (error) {
      reject(ParserError(error));
    }
  };
}

function parseData(domAsString) {
  const result = { multipleMatches: false, items: [] };
  return (resolve, reject) => {
    try {
      const $ = cheerio.load(domAsString);
      result.multipleMatches = !!$('body ul li a').length;
      if (!result.multipleMatches) {
        $('body p').each((i, elem) => result.items.push({ match: $(elem).text() }));
      } else {
        $('body ul li a').each((i, elem) =>
          result.items.push({
            match: $(elem).text(),
            id: $(elem)
              .attr('href')
              .replace(RAE_FETCH_ACTION, ''),
          }));
      }

      resolve(result);
    } catch (error) {
      reject(ParserError(error));
    }
  };
}

function parseAuthData(domAsString) {
  return new Promise(parseAuth(domAsString));
}

function parseRaeData(domAsString) {
  return new Promise(parseData(domAsString));
}

// request

async function request(
  word,
  options = { endpoint: RAE_OFFICIAL_HTTP_ENDPOINT, action: RAE_SEARCH_ACTION }
) {
  const HTTPRaeAuthResponse = await fetch(
    `${options.endpoint}${options.action}${encodeURI(word)}`,
    { method: 'GET' }
  );

  if (HTTPRaeAuthResponse.status !== 200) {
    throw NotFoundError(word);
  }

  const HTTPRaeAuthData = await parseAuthData(await HTTPRaeAuthResponse.text());

  const HTTPRaeDataResponse = await fetch(
    `${options.endpoint}${options.action}${encodeURI(word)}`,
    { method: 'POST', body: toFormData(HTTPRaeAuthData) }
  );

  if (HTTPRaeDataResponse.status !== 200) {
    throw NotFoundError(word);
  }

  const parsedRaeData = await parseRaeData(await HTTPRaeDataResponse.text());

  return parsedRaeData;
}

// http/index

class HTTPRaeClient {
  search(word) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!isAWord(word)) {
          return reject(NotValidWordError(word));
        }
        return resolve(await request(word));
      } catch (error) {
        return reject(error);
      }
    });
  }

  fetch(id) {
    return new Promise(async (resolve, reject) => {
      try {
        resolve(await request(id, {
          action: RAE_FETCH_ACTION,
          endpoint: RAE_OFFICIAL_HTTP_ENDPOINT,
        }));
      } catch (error) {
        reject(error);
      }
    });
  }
}

// index

class RaeClient {
  create(type = HTTP_CLIENT) {
    switch (type) {
      case HTTP_CLIENT:
      default:
        return new HTTPRaeClient();
    }
  }
}

module.exports = RaeClient;