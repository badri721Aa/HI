'use strict';

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function make(scope) {
  const tag = scope ? `[${scope}]` : '';
  return {
    info: (...a) => console.log(ts(), 'INFO ', tag, ...a),
    warn: (...a) => console.warn(ts(), 'WARN ', tag, ...a),
    error: (...a) => console.error(ts(), 'ERROR', tag, ...a),
    child: (sub) => make(scope ? `${scope}:${sub}` : sub),
  };
}

module.exports = make('');
