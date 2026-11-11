#!/bin/bash
# 敲散 · 用默认浏览器打开
open "$(dirname "$0")/QiaoSan.html" 2>/dev/null || xdg-open "$(dirname "$0")/QiaoSan.html"
