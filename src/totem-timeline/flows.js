import { observeEvents, appendEvent } from "./events";
import { Subject } from "rxjs";
import { concatMap } from "rxjs/operators";

let eventTypes = new Map();

observeEvents().subscribe(e => {
  let eventType = eventTypes.get(e.$type);

  if(eventType) {
    eventType.enqueue(e);
  }
});

//
// The type of an event observed by a flow
//

class EventType {
  constructor(name) {
    this.name = name;
    this.observations = [];
  }

  toString() {
    return this.name;
  }

  enqueue(e) {
    for(let observation of this.observations) {
      observation.enqueue(e);
    }
  }
}

//
// An observation of an event type by a flow
//

class Observation {
  constructor(flowType, eventType, isScheduled, idPath, canBeFirst, method) {
    this.flowType = flowType;
    this.eventType = eventType;
    this.isScheduled = isScheduled;
    this.idPath = idPath;
    this.canBeFirst = canBeFirst;
    this.method = method;

    eventType.observations.push(this);
  }

  toString() {
    return `${this.eventType} => ${this.flowType}`;
  }

  enqueue(e) {
    let isScheduled = !!e.$whenOccurs;

    if(isScheduled === this.isScheduled) {
      let id = this.resolveId();

      this.flowType.enqueue(e, id, this);
    }
  }

  resolveId() {
    let id = "";

    for(let property of this.idPath) {
      id = id[property];

      if(typeof id === "undefined" || id === null || id === "") {
        id = "";
        break;
      }
    }

    return id;
  }
}

//
// A type of flow observing events on the timeline
//

let flowTypes = new Set();

export class FlowType {
  static declare(type) {
    flowTypes.add(type);
  }

  scopesById = new Map();

  constructor(declaration) {
    this.declaration = declaration;

    this.observations = readObservations(this);

    this.isMultiInstance = this.observations.some(observation => observation.idPath.length > 0);
    this.isSingleInstance = !this.IsMultiInstance;
  }

  toString() {
    return this.declaration.toString();
  }

  enqueue(e, id, observation) {
    let existingScope = this.scopesById.get(id);

    if(existingScope) {
      existingScope.enqueue(e, observation);
    }
    else if(this.isSingleInstance || observation.canBeFirst) {
      let newScope = this.openScope(id);

      this.scopesById.set(id, newScope);

      newScope.enqueue(e, observation);
    }
    else {
      if(observation.idPath.length === 0) {
        for(let scope of this.scopesById.values()) {
          scope.enqueue(e, observation);
        }
      }
    }
  }

  deleteScope(id) {
    this.scopesById.delete(id);
  }
}

//
// Observation discovery
//

function readObservations(flowType) {
  let observations = [];

  for(let property of Object.getOwnPropertyNames(flowType.declaration.prototype)) {
    let method = flowType.declaration.prototype[property];

    if(typeof method === "function") {
      let observation = tryReadObservation(flowType, property, method);

      if(observation) {
        observations.push(observation);
      }
    }
  }

  return observations;
}

function tryReadObservation(flowType, property, method) {
	let isScheduled = false;
	let canBeFirst = false;
	
	if(property[0] === "@") {
		isScheduled = true;
		property = property.substring(1);
	}
	
	if(property[property.length - 1] === "+") {
		canBeFirst = true;
		property = property.substring(0, property.length - 1);
	}

  let [eventType, idPath] = parseProperty(property);

  return !eventType ? null : new Observation(flowType, eventType, isScheduled, idPath, canBeFirst, method);
}

function parseProperty(property) {
  let [eventName, ...idPath] = property.split(".");

  // ^                 Start the event name
  // (                
  //   -               Match a dash
  //   [_a-zA-Z]+      Then one or more underscores or letters
  //   [-_a-zA-Z0-9]*  Then zero or more dashes, underscores, letters, or numbers
  // )                
  // |                 Or match with no dash in the front, but at least one dash elsewhere
  // (
  //   [_a-zA-Z]+      Match one or more underscores or letters
  //   -               Then a dash
  //   [-_a-zA-Z0-9]*  Then zero or more dashes, underscores, letters, or numbers
  // )
  // $                 End the event name
	
	if(!eventName || !eventName.match(/^(-[_a-zA-Z]+[-_a-zA-Z0-9]*)|([_a-zA-Z]+-[-_a-zA-Z0-9]*)$/)) {
		return [null, null];
	}

	for(let i = 0; i < idPath.length; i++) {
		if(!idPath[i]) {
			throw new Error(`Expected non-empty property in identifier path: ${property}`);
		}
	}

  let eventType = eventTypes.get(eventName);

  if(!eventType) {
    eventType = new EventType(eventName);

    eventTypes.set(eventName, eventType);
  }

  return [eventType, idPath];
}

//
// The scope of a flow instance's activity on the timeline
//

export class FlowScope {
  queue = new Subject();
  stopped = false;

  constructor(type, id) {
    this.type = type;
    this.id = id;

    this.flow = new type.declaration();
    this.flow.$id = id;

    this.observeQueue();
  }

  enqueue(e, observation) {
    this.queue.next([e, observation]);
  }

  observeQueue() {
    let observeNext = concatMap(([e, observation]) =>
      this.stopped ? Promise.resolve() : this.observe(e, observation));

    this.queue.pipe(observeNext).subscribe();
  }

  stop(e, observation, error) {
    this.stopped = true;

    let { type, id } = this;

    type.deleteScope(id);

    appendEvent(e.$position, "flow-stopped", { type, id, event: e, observation, error });
  }

  deleteFromType() {
    this.type.deleteScope(this.id);
  }
}