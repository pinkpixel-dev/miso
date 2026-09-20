---
title: The lyrics assistant
description: Point Miso at a language model so it can write lyrics and expand prompts for you.
sidebar:
  order: 4
---

Miso can write the lyrics if you would rather not. This needs a language model, which is not something Miso runs itself, so you point it at one in Settings.

## Two ways to configure it

### An API provider

Any OpenAI-compatible endpoint. OpenAI, OpenRouter, Anthropic, Groq, and others all work. Give Miso three things:

- The base URL, including the version path
- A model id
- Your API key

This uses no GPU memory of yours at all, which is why it is the recommended one.

### A local llama.cpp server

Point Miso at its address, for example `http://127.0.0.1:8081/v1`. No key needed.

On a single card, remember that a language model and a 13 GB music model do not both fit. Free the card with **Unload models** first.

### Both at once

Both stay configured and a switch says which one is used, so you can keep an API key and a local server set up at the same time.

## Writing lyrics

With an engine configured, **Write lyrics for me** appears under the lyrics editor.

Describe what the song is about. The style and mood from your builder are sent along with it. You get back a tagged lyric sheet and a title, in a preview you can edit.

Nothing reaches the editor until you accept it. If the editor already has words in it, the button says it is replacing them.

## Expanding a prompt

**Make the prompt richer** does the same thing for your prompt. It sends the form as it stands and offers an expanded version beside the one you wrote.

Take it, edit it, or ignore it. Ask twice and you get two different answers, which is a cheap way to get a fresh take on the same idea.

Either way the take records both prompts, so the original idea is never lost behind the expansion.

## Where the key is stored

Your API key is stored in Miso's database under `MISO_DATA_DIR` and is sent only to the endpoint you configured.

It is never returned to the browser. Settings tells you a key is stored but cannot show it back to you.

## When it does not work

The lyrics routes do not talk to audio.cpp. The assistant works while the music backend is down, and stops working when your language model provider is down or the key is wrong.

If no engine is configured at all, the buttons do not appear.
