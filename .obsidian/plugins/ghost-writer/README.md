# Obsidian Ghost Writer Plugin

This plugin creates a Ghost Writer side panel in Obsidian powered by a locally running Ollama server.

## Features

- Left-panel idea input for dictating the core concept
- Automatic creative rewriting into a story
- Manual generation button for explicit control
- Insert generated story into the active note
- Configurable Ollama URL, model, prompt, temperature, and token limit

## Installation

1. Ensure Ollama is running locally (default: `http://localhost:11434`).
2. Copy the plugin folder into your Obsidian vault's `.obsidian/plugins/ghost-writer/` directory.
3. Reload Obsidian and enable the plugin.
4. Open the command palette and run `Open Ghost Writer`.

## Usage

- Type your idea in the left panel.
- The plugin will generate a creative story from your input.
- Use `Insert into Note` to place the output into the active markdown note.

## Requirements

- Obsidian 0.15.0+
- Ollama running locally
