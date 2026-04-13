const { Plugin, PluginSettingTab, Setting, ItemView, requestUrl, Notice, MarkdownView } = require('obsidian');

const VIEW_TYPE_GHOST_WRITER = 'ghost-writer-view';

const DEFAULT_SETTINGS = {
  ollamaUrl: 'http://localhost:11434',
  model: 'llama2',
  systemPrompt: 'You are a ghost writer. The user is dictating their idea in the left panel. Rewrite the central idea creatively and build a story around it with vivid detail, rich emotion, and narrative momentum. Output only the story text, no explanation.',
  temperature: 0.8,
  maxTokens: 400,
  autoGenerate: true,
  debounceMs: 800
};

class GhostWriterPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_GHOST_WRITER, (leaf) => new GhostWriterView(leaf, this));
    this.addSettingTab(new GhostWriterSettingTab(this.app, this));
    this.addCommand({
      id: 'open-ghost-writer',
      name: 'Open Ghost Writer',
      callback: () => this.openGhostWriter()
    });
    this.addCommand({
      id: 'insert-ghost-story-into-note',
      name: 'Insert Ghost Story into Active Note',
      callback: () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) {
          new Notice('Open a markdown note to insert the ghost story.');
          return;
        }
        const view = this.getOpenGhostWriterView();
        if (!view || !view.outputText) {
          new Notice('Generate a story first in the Ghost Writer panel.');
          return;
        }
        activeView.editor.replaceSelection(view.outputText);
        new Notice('Ghost story inserted into your active note.');
      }
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GHOST_WRITER);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async openGhostWriter() {
    const leaf = this.app.workspace.getLeftLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE_GHOST_WRITER, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  getOpenGhostWriterView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GHOST_WRITER);
    if (leaves.length === 0) return null;
    return leaves[0].view;
  }
}

class GhostWriterView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.debounceTimer = null;
    this.outputText = '';
  }

  getViewType() {
    return VIEW_TYPE_GHOST_WRITER;
  }

  getDisplayText() {
    return 'Ghost Writer';
  }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass('ghost-writer-container');

    const header = this.containerEl.createEl('div', { cls: 'ghost-writer-header' });
    header.createEl('h2', { text: 'Ghost Writer' });
    const buttonGroup = header.createEl('div', { cls: 'ghost-writer-button-group' });

    const manualButton = buttonGroup.createEl('button', { text: 'Generate Story' });
    manualButton.addEventListener('click', () => this.generateStory());

    const insertButton = buttonGroup.createEl('button', { text: 'Insert into Note' });
    insertButton.addEventListener('click', () => this.insertOutputIntoNote());

    const instructions = this.containerEl.createEl('div', { cls: 'ghost-writer-instructions' });
    instructions.setText('Type your idea in the left box. The ghost writer will rewrite the central idea creatively and build up a story in the output below.');

    this.inputEl = this.containerEl.createEl('textarea', { cls: 'ghost-writer-input' });
    this.inputEl.placeholder = 'Start dictating your idea here...';
    this.inputEl.addEventListener('input', () => this.onInputChange());

    this.statusEl = this.containerEl.createEl('div', { cls: 'ghost-writer-status' });
    this.statusEl.setText('Start typing to generate a story.');

    this.outputEl = this.containerEl.createEl('pre', { cls: 'ghost-writer-output' });
    this.outputEl.setText('The generated story will appear here.');
  }

  onClose() {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer);
    }
  }

  onInputChange() {
    if (this.plugin.settings.autoGenerate) {
      if (this.debounceTimer) {
        window.clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => this.generateStory(), this.plugin.settings.debounceMs);
    }
  }

  async generateStory() {
    const idea = this.inputEl.value.trim();
    if (!idea) {
      this.statusEl.setText('Type an idea to generate a story.');
      this.outputEl.setText('');
      this.outputText = '';
      return;
    }

    this.statusEl.setText('Generating story...');
    this.outputEl.setText('');

    const prompt = `${this.plugin.settings.systemPrompt}\n\nUser idea:\n${idea}`;
    try {
      const response = await requestUrl({
        method: 'POST',
        url: `${this.plugin.settings.ollamaUrl}/api/generate`,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt,
          model: this.plugin.settings.model,
          options: {
            temperature: this.plugin.settings.temperature,
            max_tokens: this.plugin.settings.maxTokens
          }
        })
      });

      const story = this.parseOllamaResponse(response);
      this.outputText = story;
      this.outputEl.setText(story || 'No output returned from Ollama.');
      this.statusEl.setText(story ? 'Story generated successfully.' : 'No story returned.');
    } catch (error) {
      this.statusEl.setText('Error generating story.');
      this.outputEl.setText('');
      new Notice(`Ghost Writer error: ${error.message}`);
    }
  }

  parseOllamaResponse(response) {
    const text = response.text || '';
    if (!text.trim()) {
      return '';
    }

    try {
      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.every((line) => line.trim().startsWith('{'))) {
        return lines.map((line) => {
          const parsed = JSON.parse(line);
          return parsed.response || parsed.output?.[0]?.content || parsed.text || '';
        }).join('').trim();
      }
      if (text.trim().startsWith('{')) {
        const parsed = JSON.parse(text);
        return parsed.output?.[0]?.content || parsed.response || parsed.text || '';
      }
    } catch (e) {
      // fall through to plain text
    }

    return text.trim();
  }

  insertOutputIntoNote() {
    if (!this.outputText) {
      new Notice('Generate a ghost story first before inserting.');
      return;
    }
    const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice('Open a markdown note to insert the story.');
      return;
    }
    activeView.editor.replaceSelection(this.outputText);
    new Notice('Ghost story inserted into your note.');
  }
}

class GhostWriterSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Ghost Writer Settings' });

    new Setting(containerEl)
      .setName('Ollama URL')
      .setDesc('URL of the locally running Ollama server.')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:11434')
          .setValue(this.plugin.settings.ollamaUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Model')
      .setDesc('Ollama model name to use for story generation.')
      .addText((text) =>
        text
          .setPlaceholder('llama2')
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('System prompt')
      .setDesc('The ghost writer prompt used before the user idea.')
      .addTextArea((text) =>
        text
          .setPlaceholder('You are a ghost writer...')
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Higher values make output more creative. Lower values make it more focused.')
      .addSlider((slider) =>
        slider
          .setLimits(0, 1, 0.01)
          .setValue(this.plugin.settings.temperature)
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Max tokens')
      .setDesc('Maximum output length returned by Ollama.')
      .addText((text) =>
        text
          .setPlaceholder('400')
          .setValue(String(this.plugin.settings.maxTokens))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.maxTokens = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Auto-generate on input')
      .setDesc('Automatically regenerate the story after a short pause while typing.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoGenerate)
          .onChange(async (value) => {
            this.plugin.settings.autoGenerate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Debounce delay')
      .setDesc('Delay in milliseconds before auto-generating the story after typing stops.')
      .addText((text) =>
        text
          .setPlaceholder('800')
          .setValue(String(this.plugin.settings.debounceMs))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!Number.isNaN(parsed)) {
              this.plugin.settings.debounceMs = parsed;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}

module.exports = GhostWriterPlugin;
