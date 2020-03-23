import Moment from "moment";
import { Subject, timer } from "rxjs";
import { take } from "rxjs/operators";

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

export function scheduleEvent(cause, whenOccurs, type, data) {
  let e = !data ? {} : Object.assign({}, data);

  e.$whenOccurs = Moment(whenOccurs);
  e.$position = position++;
  e.$cause = cause;
  e.$type = type;
  e.$when = Moment();

  events.next(e);
}

export function observeEvents() {
  return events.asObservable();
}

events.subscribe(e => {



  if(e.$whenOccurs) {
    let { $position, $cause, $type, $when, ...rest } = e;

    console.log(`[${$position}][@] ${$type}`, rest);
  }
  else {
    let { $whenOccurs, $position, $cause, $type, $when, ...rest } = e;

    console.log(`[${$position}] ${$type}`, rest);
  } 



  if(e.$whenOccurs) {
    timer(e.$whenOccurs.toDate())
    .pipe(take(1))
    .subscribe(() => appendScheduledEvent(e));
  }
});

function appendScheduledEvent(e) {
  let occurred = Object.assign({}, e);

  delete occurred.$whenOccurs;

  occurred.$position = position++;
  occurred.$cause = e.$position;
  occurred.$type = e.$type;
  occurred.$when = Moment();

  events.next(occurred);
}