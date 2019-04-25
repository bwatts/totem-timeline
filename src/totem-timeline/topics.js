import { appendEvent, scheduleEvent, FlowType, FlowScope } from "./flows";

export function declareTopic(declaration) {
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

class TopicScope extends FlowScope {
  constructor(type, id) {
    super(type, id);
  }

  observe(e, observation) {
    return Promise.resolve()
      .then(() => this.observeCore(e, observation))
      .catch(error => this.onObserveFailed(e, observation, error));
  }
  
  observeCore(e, observation) {
    let newEvents = [];

    let then = (type, data) =>
      newEvents.push({ type, data });

    then.schedule = (whenOccurs, type, data) =>
      newEvents.push({ whenOccurs, type, data });

    then.done = (type, data) => {
      if(type) {
        then(type, data);
      }

      this.done = true;
    };
    
    return Promise
      .resolve(observation.method.call(this.flow, e, then))
      .then(() => {
        this.addEvents(e.$position, newEvents);
        this.onObserved();
      });
  }
  
  addEvents(cause, newEvents) {
    for(let { whenOccurs, type, data } of newEvents) {
      if(whenOccurs) {
        scheduleEvent(whenOccurs, cause, type, data);
      }
      else {
        appendEvent(cause, type, data);
      }
    }
  }
}