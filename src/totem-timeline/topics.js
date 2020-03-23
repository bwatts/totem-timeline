import { appendEvent, scheduleEvent } from "./events";
import { FlowType, FlowScope } from "./flows";

//
// Declare a timeline type for the specified topic declaration
//

export default function(declaration) {
  FlowType.declare(new TopicType(declaration));
}

class TopicType extends FlowType {
  constructor(declaration) {
    super(declaration);
  }

  openScope(id) {
    return new TopicScope(this, id);
  }
}

//
// The scope of a topic's activity on the timeline
//

class TopicScope extends FlowScope {
  call = null;

  constructor(type, id) {
    super(type, id);

    if(this.flow.then) {
      throw new Error("The .then property of a topic is reserved for timeline use");
    }

    this.flow.then = (type, data) => {
      this.expectCall();
      this.call.addEvent({ type, data });
    };

    this.flow.then.schedule = (whenOccurs, type, data) => {
      this.expectCall();
      this.call.addEvent({ whenOccurs, type, data });
    };
  }

  expectCall() {
    if(!this.call) {
      throw new Error("Topic must be making a call to perform this operation");
    }
  }

  observe(e, observation) {
    return Promise.resolve()
      .then(() => this.makeCall(e, observation))
      .catch(error => this.stop(e, observation, error));
  }
  
  makeCall(e, observation) {
    this.call = new TopicCall(e.$position);

    return Promise
      .resolve(observation.method.call(this.flow, e))
      .then(result => {
        this.call.appendNewEvents();

        if(result === false) {
          this.deleteFromType();
        }
      })
      .finally(() => this.call = null);
  }
}

//
// A single call to a topic observation
//

class TopicCall {
  newEvents = [];

  constructor(cause) {
    this.cause = cause;
  }

  addEvent(e) {
    this.newEvents.push(e);
  }

  appendNewEvents() {
    for(let { whenOccurs, type, data } of this.newEvents) {
      if(whenOccurs) {
        scheduleEvent(this.cause, whenOccurs, type, data);
      }
      else {
        appendEvent(this.cause, type, data);
      }
    }
  }
}