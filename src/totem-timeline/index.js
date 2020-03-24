import http from "./http";
import { appendEvent, scheduleEvent } from "./events";
import topic from "./topics";
import query from "./queries";
import webQuery from "./web-queries";

export default {
  http,
  append: (type, data) => appendEvent(null, type, data),
  schedule: (whenOccurs, type, data) => scheduleEvent(null, whenOccurs, type, data),
  topic,
  query,
  webQuery
};