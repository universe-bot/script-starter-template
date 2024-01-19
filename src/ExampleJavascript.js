import { UniCore } from "unibot-runtime/UniCore";
const ScriptConfig = UniCore.GetScriptConfig();

const ConfigSections = {
    "General": ScriptConfig.AddAccordion({
        label: "General Settings"
    })
}

UniCore.On("tick", () => {
    const player = UniCore.GetCurrentPlayer();
    const playerPos = player.GetPosition();
    const playerHealth = player.GetHealth();
    const playerMaxHealth = player.GetMaxHealth();
});
