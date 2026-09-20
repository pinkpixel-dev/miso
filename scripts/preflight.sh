#!/usr/bin/env bash
# Checks the things that make Miso's first run fail, before it fails.
#
# The one worth running this for is the last check. A broken NVIDIA container
# setup does not announce itself: the container starts, nvidia-smi works inside
# it, and CUDA silently falls back to the CPU. Generation still produces a song,
# just minutes later than it should, and nothing in either log says why unless
# you know to look. This compares the UVM device major number on the host with
# the one inside a container, which is where that difference shows up.
#
# Usage: ./scripts/preflight.sh

set -uo pipefail

pass=0
fail=0
warn=0

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mfail\033[0m  %s\n' "$1"; fail=$((fail + 1)); }
note() { printf '  \033[33mwarn\033[0m  %s\n' "$1"; warn=$((warn + 1)); }
hint() { printf '        %s\n' "$1"; }

echo
echo "Miso preflight"
echo

# 1. Docker itself.
if ! command -v docker >/dev/null 2>&1; then
  bad "docker is not installed"
  hint "https://docs.docker.com/engine/install/"
  echo
  exit 1
fi
ok "docker is installed"

if ! docker info >/dev/null 2>&1; then
  bad "the docker daemon is not reachable"
  hint "sudo systemctl start docker"
  echo
  exit 1
fi
ok "the docker daemon is running"

# 2. The context. Docker Desktop on Linux runs in a VM that cannot pass a GPU
#    through at all, so a correct toolkit on the host still gets you nothing.
context=$(docker context show 2>/dev/null || echo unknown)
if [ "$context" = "desktop-linux" ]; then
  bad "the docker context is desktop-linux, which cannot pass a GPU through"
  hint "docker context use default"
else
  ok "docker context is '$context'"
fi

# 3. Is the nvidia runtime registered with the daemon? compose.yaml names it
#    directly, so its absence is a hard stop rather than a slow fallback.
if docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"nvidia"'; then
  ok "the nvidia container runtime is registered"
else
  bad "the nvidia container runtime is not registered with docker"
  hint "install the NVIDIA container toolkit, then:"
  hint "sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker"
fi

# 4. A card on the host.
if [ -e /dev/nvidia-uvm ]; then
  host_major=$(ls -l /dev/nvidia-uvm | awk '{print $5}' | tr -d ',')
  ok "the host has /dev/nvidia-uvm (major $host_major)"
else
  bad "the host has no /dev/nvidia-uvm"
  hint "load the driver, or run nvidia-smi once to create the device nodes"
  host_major=""
fi

# 5. The check this script exists for.
if [ -n "$host_major" ] && docker info --format '{{json .Runtimes}}' 2>/dev/null | grep -q '"nvidia"'; then
  echo
  echo "  checking the device nodes inside a container (pulls busybox, ~5 MB)"
  container_major=$(docker run --rm --runtime=nvidia \
    -e NVIDIA_VISIBLE_DEVICES=all \
    -e NVIDIA_DRIVER_CAPABILITIES=all \
    busybox sh -c 'ls -l /dev/nvidia-uvm 2>/dev/null' 2>/dev/null |
    awk '{print $5}' | tr -d ',')

  if [ -z "$container_major" ]; then
    bad "a container with the nvidia runtime sees no /dev/nvidia-uvm"
    hint "CUDA will fall back to the CPU even though nvidia-smi works"
  elif [ "$container_major" != "$host_major" ]; then
    bad "UVM major is $host_major on the host and $container_major in a container"
    hint "CUDA fails with 'unknown error' while nvidia-smi looks fine"
    hint "this is the failure that looks like success: expect CPU speed"
  else
    ok "UVM device major matches inside a container ($container_major)"
  fi
fi

echo
if [ "$fail" -gt 0 ]; then
  printf '\033[31m%s check(s) failed\033[0m, %s passed'  "$fail" "$pass"
  [ "$warn" -gt 0 ] && printf ', %s warned' "$warn"
  printf '\n\nMiso will still start. audio.cpp will run on the CPU, which for\nmusic generation means minutes per take instead of seconds.\n\n'
  exit 1
fi

printf '\033[32mall %s checks passed\033[0m' "$pass"
[ "$warn" -gt 0 ] && printf ', %s warned' "$warn"
printf '\n\nNext: docker compose up -d\n\n'
