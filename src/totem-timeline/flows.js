import { Subject } from "rxjs";
import { concatMap } from "rxjs/operators";
import { observeEvents, appendEvent } from "./events";

let routesByEventType = {};

observeEvents().subscribe(e => {
  let routes = routesByEventType[e.$type];

  if(routes) {
    for(let route of routes) {
      route.enqueue(e);
    }
  }
});

//
// Add the presence of a single- or multi-instance flow to the timeline
//

export function declareFlow(options, observations, scopeType) {
  let { name, data, routeFirst, route } = options;

  if(data && typeof data !== "function") {
    throw Error(`Flow ${name} expected the "data" option to be a function`);
  }

  if(route && !routeFirst) {
    throw Error(`Flow ${name} expected the "routeFirst" option in conjunction with the "route" option`);
  }

  if(!observations || Object.keys(observations).length === 0) {
    throw Error(`Flow ${name} expected at least one observation`);
  }

  let flowType = new FlowType(name, observations, scopeType, data, !!routeFirst);

  declareRoutes(flowType, routeFirst, route);

  return flowType;
}

//
// Add routes for each type of event observed by a flow type
//

function declareRoutes(flowType, routeFirst, route) {
  if(flowType.isSingleInstance) {
    for(let eventType in flowType.observations) {
      declareRoute(new Route(eventType, flowType));
    }

    return;
  }

  let eventTypes = new Set([
    ...Object.keys(routeFirst),
    ...(route ? Object.keys(route) : [])
  ]);

  let hasFirst = false;

  for(let eventType of eventTypes) {
    let selectIds = routeFirst[eventType] || route[eventType];
    let canBeFirst = !!routeFirst[eventType];

    hasFirst |= canBeFirst;

    declareRoute(new Route(eventType, flowType, selectIds, canBeFirst));
  }

  if(!hasFirst) {
    throw Error(`Flow "${flowType}" expected at least one event type in the "routeFirst" option`);
  }

  for(let observedEventType in flowType.observations) {
    if(!eventTypes.delete(observedEventType)) {
      throw Error(`Flow "${flowType}" expected a route when observing "${observedEventType}". Add the event to either the "routeFirst" or "route" option.`);
    }
  }

  if(eventTypes.length > 0) {
    throw Error(`Flow "${flowType}" expected an observation when routing the below event types. Observe them or remove them from the "routeFirst" and "route" options.\n${eventTypes.join("\n")}`);
  }
}

//
// Add a route to those notified when its event type occurs
//

function declareRoute(route) {
  let eventRoutes = routesByEventType[route.eventType];

  if(!eventRoutes) {
    eventRoutes = [];

    routesByEventType[route.eventType] = eventRoutes;
  }

  eventRoutes.push(route);
}

//
// A type of flow observing events on the timeline
//

class FlowType {
  scopesById = new Map();

  constructor(name, observations, scopeType, data, isMultiInstance) {
    this.name = name;
    this.observations = observations;
    this.scopeType = scopeType;
    this.data = data || function() { return {}; };
    this.isMultiInstance = isMultiInstance;
    this.isSingleInstance = !isMultiInstance;
  }

  toString() {
    return this.name;
  }

  enqueue(e, ids, route) {
    let observation = this.observations[route.eventType];

    for(let id of ids) {
      let scope = this.scopesById.get(id);

      if(!scope && (this.isSingleInstance || route.canBeFirst)) {
        scope = new this.scopeType(this, id);

        this.scopesById.set(id, scope);
      }

      if(observation) {
        scope.enqueue(e, observation);
      }
    }
  }

  getOrOpenScope(id) {
    let scope = this.scopesById.get(id);

    if(!scope) {
      scope = new this.scopeType(this, id);

      this.scopesById.set(id, scope);
    }

    return scope;
  }

  deleteScope(id) {
    this.scopesById.delete(id);
  }
}

//
// The scope of a flow instance's activity on the timeline
//

export class FlowScope {
  queue = new Subject();
  subscription = null;
  stopped = false;

  constructor(type, id) {
    this.type = type;
    this.id = id;

    this.flow = type.data();

    if(id) {
      this.flow.$id = id;
    }

    this.observeQueue();
  }

  toString() {
    return this.type.isSingleInstance ? this.type : `${this.type}/${this.id}`;
  }

  enqueue(e, observation) {
    this.queue.next([e, observation]);
  }

  observeQueue() {
    let observeNext = concatMap(([e, observation]) =>
      this.stopped ? Promise.resolve() : this.observe(e, observation));

    this.subscription = this.queue.pipe(observeNext).subscribe();
  }

  observe() {
    // Overridden by TopicScope and QueryScope
  }

  stop(e, error) {
    this.stopped = true;
    this.unsubscribe();

    appendEvent(e.$position, null, "timeline:flowStopped", {
      type: this.type.name,
      id: this.id,
      error,
      cause: e
    });
  }

  unsubscribe() {
    this.subscription.unsubscribe();
    this.subscription = null;

    this.type.deleteScope(this.id);
  }
}

//
// An event observed by a flow on the timeline
//

class Route {
  constructor(eventType, flowType, selectIds = null, canBeFirst = false) {
    this.eventType = eventType;
    this.flowType = flowType;
    this.selectIds = selectIds;
    this.canBeFirst = canBeFirst;
  }

  toString() {
    return `${this.eventType} => ${this.flowType}`;
  }

  enqueue(e) {
    let { flowType, selectIds } = this;

    if(!selectIds) {
      flowType.enqueue(e, [""], this);
      return;
    }

    let selection = selectIds(e);
    let ids = [];

    if(selection) {
      if(!Array.isArray(selection)) {
        selection = [selection];
      }

      for(let item of selection) {
        let id = item && item.toString();

        if(id) {
          ids.push(id);
        }
      }
    }

    flowType.enqueue(e, ids, this);
  }
}