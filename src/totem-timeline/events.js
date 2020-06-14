import Moment from "moment";
import { Subject, timer } from "rxjs";
import { filter, take } from "rxjs/operators";

let events = new Subject();
let position = 0;

export function appendEvent(cause, topic, type, data) {
  let e = { ...data };

  e.$position = position++;
  e.$type = type;
  e.$cause = cause;
  e.$topic = topic;
  e.$when = Moment();
  e.$whenOccurs = null;

  events.next(e);

  return e;
}

export function scheduleEvent(cause, topic, whenOccurs, type, data) {
  let e = { ...data };

  e.$position = position++;
  e.$type = type;
  e.$cause = cause;
  e.$topic = topic;
  e.$when = Moment();
  e.$whenOccurs = Moment(whenOccurs);

  events.next(e);

  return e;
}

export function observeEvents() {
  return events.asObservable();
}

events
.pipe(filter(e => e.$whenOccurs))
.subscribe(setScheduleTimer);

function setScheduleTimer(e) {
  timer(e.$whenOccurs.toDate())
  .pipe(take(1))
  .subscribe(() => events.next({
    ...e,
    $position: position++,
    $type: e.$type,
    $cause: e.$position,
    $topic: null,
    $when: Moment(),
    $whenOccurs: null
  }));
}