import Moment from "moment";
import { FlowType, FlowScope } from "./flows";

export function declareQuery(first, second) {
  let declaration = second || first;
  let argsToId = second ? first : null;

  let type = new QueryType(declaration, argsToId);

  FlowType.declare(type);

  return {
    bind: (args, notify) => type.bind(args, notify)
  };
}

//
// A type of query observing events on the timeline
//

class QueryType extends FlowType {
  constructor(declaration, argsToId) {
    super(declaration);

    if(this.isMultiInstance && !argsToId) {
      throw new Error(`Multi-instance queries require an id selector: Timeline.query(args => args.[idProp], ...`);
    }

    this.argsToId = argsToId;
  }

  openScope(id) {
    return new QueryScope(this, id);
  }

  bind(args, notify) {
    return new QueryBinding(this, args, notify);
  }

  getId(args) {
    if(args && typeof args === "function") {
      args = args();
    }

    return !this.argsToId ? "" : this.argsToId(args);
  }

  getOrOpenScope(id) {
    let query = this.flowsById.get(id);

    if(!query) {
      query = this.openScope(id);

      this.flowsById.set(id, query);
    }

    return query;
  }
}

//
// The scope of a query instance's activity on the timeline
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

    binding.update(this.toData());
  }

  unsubscribe(binding) {
    this.bindings.delete(binding);

    if(this.bindings === 0 && this.isNew) {
      this.type.deleteFlow(this.id);
    }
  }
  
  observe(e, observation) {
    this.isNew = false;

    try {
      observation.method.call(this.flow, e, () => this.done = true);

      this.flow.$whenChanged = Moment();

      this.updateBindings();

      this.onObserved();
    }
    catch(error) {
      this.onObserveFailed(e, observation, error);
    }

    return Promise.resolve();
  }

  toData() {
    let data = {};

    for(let prop in this.flow) {
      if(!prop.startsWith("_")) {
        data[prop] = this.flow[prop];
      }
    }

    return data;
  }

  updateBindings() {
    let data = this.toData();

    for(let binding of this.bindings) {
      binding.update(data);
    }
  }
}

//
// Observes changes in a query
//

class QueryBinding {
  constructor(type, args, notify) {
    this.type = type;
    this.args = args;
    this.notify = notify;

    this.query = type.getOrOpenScope(type.getId(args));

    this.data = this.query.toData();
  }

  subscribe() {
    this.query.subscribe(this);
  }

  resubscribeIfArgsChanged() {
    let id = this.type.getId(this.args);

    if(id !== this.query.id) {
      this.query.unsubscribe(this);

      this.query = this.type.getOrOpenScope(id);

      this.query.subscribe(this);

      this.update(this.query.toData());
    }
  }

  unsubscribe() {
    this.query.unsubscribe(this);
  }

  update(data) {
    this.data = data;

    this.notify();
  }
}