import Moment from "moment";
import { declareFlow, FlowScope } from "./flows";

export default function declareQuery(options) {
  if(!options || !options.name) {
    throw Error("Query declaration expected options with a name at minimum");
  }

  let { name, given, givenScheduled, argsToId } = options;

  if(!(given || givenScheduled)) {
    throw Error(`Query "${name}" expected any combination of the "given" and "givenScheduled" options`);
  }

  let observations = {};

  given = given || {};
  givenScheduled = givenScheduled || {};

  let eventTypes = new Set([
    ...Object.keys(given),
    ...Object.keys(givenScheduled)
  ]);

  for(let eventType of eventTypes) {
    observations[eventType] = {
      given: given[eventType],
      givenScheduled: givenScheduled[eventType]
    };
  }

  let type = declareFlow(options, observations, QueryScope);

  if(type.isMultiInstance && !argsToId) {
    throw new Error(`Multi-instance query "${name}" require an id selector. Specify the "argsToId" option in the declaration.`);
  }

  if(type.isSingleInstance && argsToId) {
    throw new Error(`Single-instance query "${name}" does not require an id selector. Remove the "argsToId" option in the declaration.`);
  }

  return {
    getDefaultData() {
      return filterPrivateData(type.data());
    },
    bind(args, notify) {
      return new QueryBinding(type, argsToId, args, notify);
    }
  };
}

//
// Copy the publicly-visible data from a query instance
//

function filterPrivateData(instance) {
  let data = {};

  for(let prop in instance) {
    if(!prop.startsWith("_")) {
      data[prop] = instance[prop];
    }
  }

  return data;
}

//
// The scope of a query's activity on the timeline
//

class QueryScope extends FlowScope {
  bindings = new Set();
  isNew = true;

  constructor(type, id) {
    super(type, id);

    this.flow.$whenCreated = Moment();
    this.flow.$whenChanged = this.flow.$whenCreated;
  }

  subscribe(binding) {
    this.bindings.add(binding);

    binding.update(filterPrivateData(this.flow));
  }

  unsubscribe(binding) {
    this.bindings.delete(binding);

    if(this.bindings === 0 && this.isNew) {
      this.type.deleteScope(this.id);
    }
  }

  observe(e, { given, givenScheduled }) {
    this.isNew = false;

    try {
      this.callGiven(e, e.$whenOccurs ? givenScheduled : given);
    }
    catch(error) {
      this.stop(e, error);
    }

    return Promise.resolve();
  }

  callGiven(e, method) {
    let result = method.call(this.flow, e);

    if(result === false) {
      this.unsubscribe();
    }

    this.flow.$whenChanged = Moment();

    let data = filterPrivateData(this.flow);

    for(let binding of this.bindings) {
      binding.update(data);
    }
  }
}

//
// Observes changes in a query and notifies observers of new data
//

class QueryBinding {
  constructor(type, argsToId, args, notify) {
    this.type = type;
    this.argsToId = argsToId;
    this.args = args;
    this.notify = notify;
  }

  resolveId() {
    let { type, argsToId, args } = this;
    let id = "";

    if(argsToId) {
      while(typeof args === "function") {
        args = args();
      }

      id = (argsToId(args) || "").toString();

      if(!id) {
        throw new Error(`Query "${type}" expects an identifier from the "argsToId" option`);
      }
    }

    return id;
  }

  subscribe() {
    this.scope = this.type.getOrOpenScope(this.resolveId());

    this.scope.subscribe(this);
  }

  resubscribeIfArgsChanged() {
    let id = this.resolveId();

    if(id !== this.scope.id) {
      this.scope.unsubscribe(this);

      this.scope = this.type.getOrOpenScope(id);

      this.scope.subscribe(this);
    }
  }

  unsubscribe() {
    this.scope.unsubscribe(this);
  }

  update(data) {
    this.data = data;

    this.notify();
  }
}