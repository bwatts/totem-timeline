import console from "./console";
import { appendEvent, scheduleEvent } from "./events";
import http from "./http";
import topic from "./topics";
import query from "./queries";
import webQuery from "./webQueries";

export default {
  console,
  append: (type, data) => appendEvent(null, null, type, data),
  schedule: (whenOccurs, type, data) => scheduleEvent(null, null, whenOccurs, type, data),
  http,
  topic,
  query,
  webQuery
};