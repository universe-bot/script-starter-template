import { UniCore } from "unibot-api/UniCore";
import { print } from "./utils/log";
const ScriptConfig = UniCore.GetScriptConfig();

const ConfigSections = {
  General: ScriptConfig.AddAccordion({
    label: "General Settings",
  }),
};

const loggingCheckbox = ScriptConfig.AddCheckBox({
  label: "Enable Logging",
  _parent: ConfigSections.General,
  defaultValue: true,
});

UniCore.On("tick", () => {
  const player = UniCore.GetCurrentPlayer();
  const playerLevel = player.GetLevel();
  const playerCurrentHealth = player.GetCurrentHealth();
  const playerMaxHealth = player.GetMaxHealth();

  if (loggingCheckbox.GetValue()) {
    print(
      `Player is level ${playerLevel} with ${playerCurrentHealth}/${playerMaxHealth} health.`
    );
  }
});
