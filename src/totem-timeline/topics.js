import { appendEvent, scheduleEvent } from "./events";
import { declareFlow, FlowScope } from "./flows";

export default function declareTopic(options) {
  if(!options || !options.name) {
    throw Error("Topic declaration expected options with a name at minimum");
  }

  let { name, given, givenScheduled, when, whenScheduled } = options;

  if(!(given || givenScheduled || when || whenScheduled)) {
    throw Error(`Topic "${name}" expected any combination of the "given", "givenScheduled", "when", and "whenScheduled" options`);
  }

  given = given || {};
  givenScheduled = givenScheduled || {};
  when = when || {};
  whenScheduled = whenScheduled || {};

  let observations = {};

  let eventTypes = new Set([
    ...Object.keys(given),
    ...Object.keys(givenScheduled),
    ...Object.keys(when),
    ...Object.keys(whenScheduled)
  ]);

  for(let eventType of eventTypes) {
    observations[eventType] = {
      given: given[eventType],
      givenScheduled: givenScheduled[eventType],
      when: when[eventType],
      whenScheduled: whenScheduled[eventType]
    };
  }

  declareFlow(options, observations, TopicScope);
}

//
// The scope of a topic's activity on the timeline
//

class TopicScope extends FlowScope {
  newEvents = null;

  constructor(type, id) {
    super(type, id);

    if(this.flow.then) {
      throw new Error(`Topic "${type}" reserves the .then property for timeline use. Rename or remove it from the "data" option.`);
    }

    this.flow.then = (type, data) =>
      this.newEvents.push({ type, data });

    this.flow.then.schedule = (whenOccurs, type, data) =>
      this.newEvents.push({ whenOccurs, type, data });
  }

  async observe(e, observation) {
    this.event = e;
    this.observation = observation;
    this.newEvents = [];

    try {
      this.tryCallGiven();

      await this.tryCallWhen();
    }
    catch(error) {
      this.stop(e, error);
    }
    finally {
      this.event = null;
      this.observation = null;
      this.newEvents = null;
    }
  }

  tryCallGiven() {
    let { $topic, $whenOccurs } = this.event;
    let { given, givenScheduled } = this.observation;

    if($topic && $topic.type === this.type && $topic.id === this.id) {
      return;
    }

    let method = $whenOccurs ? givenScheduled : given;

    if(method) {
      method.call(this.flow, this.event);
    }
  }

  async tryCallWhen() {
    let { $whenOccurs } = this.event;
    let { when, whenScheduled } = this.observation;

    let method = $whenOccurs ? whenScheduled : when;

    if(!method) {
      return;
    }

    let result = await Promise.resolve(method.call(this.flow, this.event));

    if(result === false) {
      this.unsubscribe();
    }

    for(let newEvent of this.appendNewEvents()) {
      if(this.stopped) {
        break;
      }

      this.tryCallImmediateGiven(newEvent);
    }
  }

  appendNewEvents() {
    let cause = this.event.$position;
    let topic = { type: this.type, id: this.id };

    return this.newEvents.map(({ whenOccurs, type, data }) =>
      whenOccurs ?
        scheduleEvent(cause, topic, whenOccurs, type, data) :
        appendEvent(cause, topic, type, data));
  }

  tryCallImmediateGiven(newEvent) {
    let observation = this.type.observations[newEvent.$type];

    if(observation) {
      let method = newEvent.$whenOccurs ? observation.givenScheduled : observation.given;

      if(method) {
        try {
          method.call(this.flow, newEvent);
        }
        catch(error) {
          this.stop(newEvent, error);
        }
      }
    }
  }
}