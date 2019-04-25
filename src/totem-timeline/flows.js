import Moment from "moment";
import { Subject, timer } from "rxjs";
import { concatMap } from "rxjs/operators";

let eventTypes = new Map();
let events = new Subject();
let position = 0;

export function appendEvent(cause, type, data) {
  let e = !data ? {} : Object.assign({}, data);

  e.$position = position++;
  e.$cause = cause;
  e.$type = type;
  e.$when = Moment();

  events.next(e);
}

export function scheduleEvent(whenOccurs, cause, type, data) {
  let e = !data ? {} : Object.assign({}, data);

  e.$whenOccurs = Moment(whenOccurs);
  e.$position = position++;
  e.$cause = cause;
  e.$type = type;
  e.$when = Moment();

  events.next(e);
}

function appendScheduledEvent(e) {
  let occurred = Object.assign({}, e);

  delete occurred.$whenOccurs;

  occurred.$position = position++;
  occurred.$cause = e.$position;
  occurred.$type = e.$type;
  occurred.$when = Moment();

  events.next(occurred);
}

events.subscribe(e => {
  let eventType = eventTypes.get(e.$type);

  if(eventType) {
    eventType.observe(e);
  }

  if(e.$whenOccurs) {
    timer(e.$whenOccurs.toDate())
    .take(1)
    .subscribe(() => appendScheduledEvent(e));
  }
});

//
// The type of an event observed by a flow
//

class EventType {
  observations = [];

  constructor(name) {
    this.name = name;
  }

  toString() {
    return this.name;
  }

  observe(e) {
    for(let observation of this.observations) {
      observation.observe(e);
    }
  }
}

//
// An observation of an event type by a flow
//

class Observation {
  constructor(flowType, eventType, isScheduled, idPath, isFirst, method) {
    this.flowType = flowType;
    this.eventType = eventType;
    this.isScheduled = isScheduled;
    this.idPath = idPath;
    this.isFirst = isFirst;
    this.method = method;

    eventType.observations.push(this);
  }

  toString() {
    return `${this.eventType} => ${this.flowType}`;
  }

  observe(e) {
    let isScheduled = !!e.$whenOccurs;

    if(isScheduled !== this.isScheduled) {
      return;
    }

    let { flowType, eventType, idPath } = this;

    let id = "";

    if(idPath) {
      for(let property of idPath) {
        id = id[property];

        if(typeof id === "undefined" || id === null || id === "") {
          id = "";
          break;
        }
      }

      if(id === "") {
        throw new Error(`Identifier path ${idPath} for event ${eventType} on flow ${flowType} has an undefined, null, or empty value`);
      }
    }

    flowType.enqueue(e, id, this);
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

  flowsById = new Map();
  stoppedIds = new Set();

  constructor(declaration) {
    this.declaration = declaration;

    this.observations = readObservations(this);

    this.isMultiInstance = this.observations.some(observation => observation.idPath);
    this.isSingleInstance = !this.IsMultiInstance;
  }

  toString() {
    return this.declaration.toString();
  }

  enqueue(e, id, observation) {
    if(this.stoppedIds.has(id)) {
      return;
    }

    let existingFlow = this.flowsById.get(id);

    if(existingFlow) {
      existingFlow.enqueue(e, observation);
    }
    else if(this.isSingleInstance || observation.isFirst) {
      let newFlow = this.openScope(id);

      this.flowsById.set(id, newFlow);

      newFlow.enqueue(e, observation);
    }
    else {
      if(!observation.idPath) {
        for(let flow of this.flowsById.values()) {
          flow.enqueue(e, observation);
        }
      }
    }
  }

  deleteFlow(id) {
    this.flowsById.delete(id);
  }

  stopFlow(id) {
    this.flowsById.delete(id);
    this.stoppedIds.add(id);
  }
}

function readObservations(flowType) {
  let observations = [];

  for(let property of Object.getOwnPropertyNames(flowType.declaration.prototype)) {
    let method = flowType.declaration.prototype[property];

    if(typeof method === "function") {
      // ^              Start the method name
      // \:             Check if the method is an observation
      // (@?)           [1] Check if the event is scheduled
      // (\w+)          [2] Event type
      // (              [3] ID, if any
      //   (            [4] ID path
      //     \.         Property separator
      //     \w+        Property name
      //   )*           Property path (zero or more properties)
      // )              End the ID, if any
      // (\+?)          [5] Check if the observation can be first
      // $              End the method name

      let nameMatch = /^\:(@?)(\w+)((\.\w+)*)(\+?)$/.exec(property);

      if(nameMatch) {
        let isScheduled = nameMatch[1] === "@";

        let eventType = eventTypes.get(nameMatch[2]);

        if(!eventType) {
          eventType = new EventType(nameMatch[2]);

          eventTypes.set(nameMatch[2], eventType);
        }

        let idPath = !nameMatch[3] ? null : nameMatch[3].substring(1).split(".");

        let isFirst = nameMatch[nameMatch.length - 1] === "+";

        observations.push(new Observation(flowType, eventType, isScheduled, idPath, isFirst, method));
      }
    }
  }

  return observations;
}

//
// The scope of a flow instance's activity on the timeline
//

export class FlowScope {
  queue = new Subject();
  done = false;

  constructor(type, id) {
    this.type = type;
    this.id = id;

    this.flow = new type.declaration();
    this.flow.$id = id;

    this.queue
      .pipe(concatMap(([e, observation]) => this.observe(e, observation)))
      .subscribe();
  }

  enqueue(e, observation) {
    this.queue.next([e, observation]);
  }

  observe(e, observation) {
    throw new Error("Expected an override");
  }

  onObserved() {
    if(this.done) {
      this.type.deleteFlow(this.id);
    }
  }

  onObserveFailed(e, observation, error) {
    let { type, id } = this;

    type.stopFlow(id);

    appendEvent(e.$position, "timeline:FlowStopped", { type, id, event: e, observation, error });
  }
}