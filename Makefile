VERSION := $(shell node -p "require('./package.json').version")
APP_ID := com.wisp.memoriestv
DEVICE ?= LG_TV

pack:
	npm run pack-p && ares-package dist/ -o ./build/ -n

install:
	ares-install --device $(DEVICE) ./build/$(APP_ID)_$(VERSION)_all.ipk

launch:
	ares-launch --device $(DEVICE) $(APP_ID)

inspect:
	ares-inspect --device $(DEVICE) $(APP_ID)
