import { observeEvents } from "./events";

let subscription;

export default {
  enable(options = {}) {
    if(subscription) {
      subscription.unsubscribe();
    }

    subscription = subscribe(options);
  },
  disable() {
    if(subscription) {
      subscription.unsubscribe();
      subscription = null;
    }
  }
};

function subscribe(options) {
  let { filter, write, writeStopped } = buildObservation(options);

  return observeEvents().subscribe(e => {
    if(e.$type === "timeline:flowStopped") {
      writeStopped(e);
    }
    else {
      if(filter(e)) {
        write(e);
      }
    }
  });
}

function buildObservation({ level = "", filter, write, includeMetadata }) {
  return {
    filter: buildFilter(),
    write: buildWrite(),
    writeStopped
  };

  function buildFilter() {
    let condition = buildCondition(filter, "every");

    if(condition) {
      return condition;
    }

    let include = filter && buildCondition(filter.include, "some");
    let exclude = filter && buildCondition(filter.exclude, "some");

    if(include && exclude) {
      return e => include(e) && !exclude(e);
    }
    else if(include) {
      return include;
    }
    else if(exclude) {
      return e => !exclude(e);
    }
    else {
      return () => true;
    }
  }

  function buildCondition(value, arrayMethod) {
    if(typeof value === "function") {
      return value;
    }
    else if(typeof value === "string") {
      return e => e.$type === value;
    }
    else if(value instanceof RegExp) {
      return e => value.test(e.$type);
    }
    else if(Array.isArray(value)) {
      let conditions = value.map(item => buildCondition(item, "every"));

      return e => conditions[arrayMethod](condition => condition(e));
    }
    else {
      return null;
    }
  }

  function buildWrite() {
    if(write) {
      return e => write(e, level);
    }

    let method = selectMethod();

    return e => method(...getDetails(e));
  }

  function writeStopped(e) {
    let { $position, type, id, error, cause } = e;

    let flow = id ? `${type}/${id}` : type;

    console.error(`[${$position}] Flow "${flow}" stopped: ${error.stack}\n\nCaused by:`, ...getDetails(cause));
  }

  function selectMethod() {
    switch(level) {
      case "error": return console.error;
      case "debug": return console.debug;
      case "info": return console.info;
      case "warn": return console.warn;
      default: return console.log;
    }
  }

  function getDetails(e) {
    let { $position, $type, ...details } = e;

    if(!includeMetadata) {
      delete details.$cause;
      delete details.$topic;
      delete details.$when;
      delete details.$whenOccurs;
    }

    return [`[${$position}]${e.$whenOccurs ? "@" : ""} ${$type}`, details];
  }
}