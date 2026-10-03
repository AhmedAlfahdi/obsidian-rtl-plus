import { App, PluginSettingTab, Setting } from "obsidian";
import type { Direction } from "./direction";
import type RtlSupportPlugin from "./main";

export interface RtlSettings {
  defaultDirection: Direction;
  rememberPerFile: boolean;
  fileDirections: Record<string, Direction>;
  setNoteTitleDirection: boolean;
  pinFrontmatterLtr: boolean;
  setYamlDirectionInPreview: boolean;
  statusBar: boolean;
}

export const DEFAULT_SETTINGS: RtlSettings = {
  defaultDirection: "auto",
  rememberPerFile: true,
  fileDirections: {},
  setNoteTitleDirection: true,
  pinFrontmatterLtr: true,
  setYamlDirectionInPreview: false,
  statusBar: true,
};

export class RtlSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: RtlSupportPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "RTL Support++" });

    new Setting(containerEl)
      .setName("Default text direction")
      .setDesc(
        "Used when a note has no direction: in its frontmatter and none is " +
          "remembered for it. Auto detects the direction from the note's content.",
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("ltr", "Left to right")
          .addOption("rtl", "Right to left")
          .addOption("auto", "Auto (detect)")
          .setValue(this.plugin.settings.defaultDirection)
          .onChange(async (value) => {
            this.plugin.settings.defaultDirection = value as Direction;
            await this.plugin.saveSettings();
            this.plugin.refreshActiveView();
          }),
      );

    new Setting(containerEl)
      .setName("Remember direction per note")
      .setDesc(
        "Store the direction you choose for each note, so it is restored when " +
          "you reopen it.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rememberPerFile)
          .onChange(async (value) => {
            this.plugin.settings.rememberPerFile = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Set note title direction")
      .setDesc("Apply the note's direction to its title in the tab header.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.setNoteTitleDirection)
          .onChange(async (value) => {
            this.plugin.settings.setNoteTitleDirection = value;
            await this.plugin.saveSettings();
            this.plugin.refreshActiveView();
          }),
      );

    new Setting(containerEl)
      .setName("Keep frontmatter left to right")
      .setDesc(
        "Raw YAML in the editor always reads left to right, whatever the note's " +
          "direction is. Recommended: property values are usually Latin and " +
          "punctuation otherwise jumps around.",
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.pinFrontmatterLtr)
          .onChange(async (value) => {
            this.plugin.settings.pinFrontmatterLtr = value;
            await this.plugin.saveSettings();
            this.plugin.refreshActiveView();
          }),
      );

    new Setting(containerEl)
      .setName("Right-align YAML in reading view")
      .setDesc("Show YAML blocks right-aligned in RTL notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.setYamlDirectionInPreview)
          .onChange(async (value) => {
            this.plugin.settings.setYamlDirectionInPreview = value;
            await this.plugin.saveSettings();
            this.plugin.refreshActiveView();
          }),
      );

    new Setting(containerEl)
      .setName("Show status bar item")
      .setDesc("A clickable status bar item showing and cycling the direction.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.statusBar)
          .onChange(async (value) => {
            this.plugin.settings.statusBar = value;
            await this.plugin.saveSettings();
            this.plugin.refreshActiveView();
          }),
      );
  }
}
