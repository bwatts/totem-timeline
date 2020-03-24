//
// Bind a timeline query to the data of a Vue component
//

export default function UI(query, component) {
  mix(component, getOrAddMixin(query));

  return component;
}

//
// Keep and reuse mixins for each bound query
//

let mixinsByQuery = new Map();

function getOrAddMixin(query) {
  let mixin = mixinsByQuery.get(query);

  if(!mixin) {
    mixin = buildMixin(query);

    mixinsByQuery.set(query, mixin);
  }

  return mixin;
}

//
// Make a mixin that binds a query to the data of a Vue component
//

function buildMixin(query) {
  let bindings = new Map();

  return {
    created() {
      let binding = bindUI(query, this);

      bindings.set(this, binding);

      binding.subscribe();
    },

    updated() {
      bindings.get(this).resubscribeIfArgsChanged();
    },

    beforeDestroy() {
      bindings.get(this).unsubscribe();

      bindings.delete(this);
    },

    watch: {
      $props: {
        deep: true,
        handler() {
          bindings.get(this).resubscribeIfArgsChanged();
        }
      }
    }
  };
}

function bindUI(query, ui) {
  let binding = query.bind(ui, () => {
    for(let prop in ui.$data) {
      if(prop in binding.data) {
        ui[prop] = binding.data[prop];
      }
    }
  });

  return binding;
}

//
// Add the UI mixin to the collection specified by the component
//

function mix(component, mixin) {
  let { mixins } = component;

  if(!mixins) {
    component.mixins = [mixin];
  }
  else if(!Array.isArray(mixins)) {
    throw new Error("Expected an array of mixins on the component");
  }
  else {
    if(!mixins.includes(mixin)) {
      mixins.push(mixin);
    }
  }
}