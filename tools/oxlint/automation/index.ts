import noBannedTypeAssertions from "./rules/no-banned-type-assertions.ts";
import noAmbientNondeterminism from "./rules/no-ambient-nondeterminism.ts";
import noCascadingLayerProvide from "./rules/no-cascading-layer-provide.ts";
import noDirectBrowserStorage from "./rules/no-direct-browser-storage.ts";
import noDirectFetch from "./rules/no-direct-fetch.ts";
import noDisableValidation from "./rules/no-disable-validation.ts";
import noEffectAsvoid from "./rules/no-effect-asvoid.ts";
import noGlobalJson from "./rules/no-global-json.ts";
import noInOperator from "./rules/no-in-operator.ts";
import noNestedEffectArrayMethods from "./rules/no-nested-effect-array-methods.ts";
import noNestedLayerProvide from "./rules/no-nested-layer-provide.ts";
import noShadowedStandardArrayStatic from "./rules/no-shadowed-standard-array-static.ts";
import noSilentErrorSwallow from "./rules/no-silent-error-swallow.ts";
import noStaticEffectServiceForwarders from "./rules/no-static-effect-service-forwarders.ts";
import noSwitch from "./rules/no-switch.ts";
import noTryCatch from "./rules/no-try-catch.ts";
import noTypeofObject from "./rules/no-typeof-object.ts";
import pipeMaxArguments from "./rules/pipe-max-arguments.ts";
import preferEffectMatch from "./rules/prefer-effect-match.ts";
import preferOptionFromNullable from "./rules/prefer-option-from-nullable.ts";
import noReactComponentInnerFunctions from "./rules/no-react-component-inner-functions.ts";
import noSqlTypeParameter from "./rules/no-sql-type-parameter.ts";

export default {
  meta: { name: "automation" },
  rules: {
    "no-banned-type-assertions": noBannedTypeAssertions,
    "no-ambient-nondeterminism": noAmbientNondeterminism,
    "no-cascading-layer-provide": noCascadingLayerProvide,
    "no-direct-browser-storage": noDirectBrowserStorage,
    "no-direct-fetch": noDirectFetch,
    "no-disable-validation": noDisableValidation,
    "no-effect-asvoid": noEffectAsvoid,
    "no-global-json": noGlobalJson,
    "no-in-operator": noInOperator,
    "no-nested-effect-array-methods": noNestedEffectArrayMethods,
    "no-nested-layer-provide": noNestedLayerProvide,
    "no-shadowed-standard-array-static": noShadowedStandardArrayStatic,
    "no-silent-error-swallow": noSilentErrorSwallow,
    "no-static-effect-service-forwarders": noStaticEffectServiceForwarders,
    "no-switch": noSwitch,
    "no-try-catch": noTryCatch,
    "no-typeof-object": noTypeofObject,
    "pipe-max-arguments": pipeMaxArguments,
    "prefer-effect-match": preferEffectMatch,
    "prefer-option-from-nullable": preferOptionFromNullable,
    "no-react-component-inner-functions": noReactComponentInnerFunctions,
    "no-sql-type-parameter": noSqlTypeParameter,
  },
};
