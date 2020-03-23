import Moment from "moment";
import { FlowType, FlowScope } from "./flows";

//
// Declare a timeline type for the specified query declaration. If the query is
// multi-instance, the first argument is an id selector.
//

export default function(arg0, arg1) {
  let declaration = arg1 || arg0;
  let argsToId = arg1 ? arg0 : null;

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
      throw new Error(`Multi-instance queries require an id selector: Timeline.query(args => [select id], ...`);
    }

    this.argsToId = argsToId;
  }

  bind(args, notify) {
    return new QueryBinding(this, args, notify);
  }

  openScope(id) {
    return new QueryScope(this, id);
  }

  resolveId(args) {
    if(!this.argsToId) {
      return "";
    }

    while(typeof args === "function") {
      args = args();
    }

    return this.argsToId(args) || "";
  }

  getOrOpenScope(id) {
    let scope = this.scopesById.get(id);

    if(!scope) {
      scope = this.openScope(id);

      this.scopesById.set(id, scope);
    }

    return scope;
  }
}

//
// Observes changes in a query and notifies observers of new data
//

class QueryBinding {
  constructor(type, args, notify) {
    this.type = type;
    this.args = args;
    this.notify = notify;

    this.resolveId = () => type.resolveId(args);
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
      this.type.deleteScope(this.id);
    }
  }
  
  observe(e, observation) {
    this.isNew = false;

    try {
      let result = observation.method.call(this.flow, e);

      if(result === false) {
        this.deleteFromType();
      }

      this.flow.$whenChanged = Moment();

      this.updateBindings();
    }
    catch(error) {
      this.stop(e, observation, error);
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