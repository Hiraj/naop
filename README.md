# NAOP
Node Asterisk Operator Panel. Currently is just support for SIP, because I don't know
how to test other like DAHDI, IAX2, etc. This project was created for monitor the Asterisk
extensions and trunks. Tested with Asterisk 11.

Currently is under development.

## Browser Supports
Currently Front-End is using [bootstrap-vue](https://bootstrap-vue.js.org). For browser support you can see
[browser supports](https://bootstrap-vue.js.org/docs/#browsers-support).

## Configuration
For configuration of this app you can see at `server.conf`.
```config
[web]
; Port for web server
port = 3000

[ami]
; Asterisk host
host = 192.168.56.3
; AMI port
port = 5038
; AMI username
user = naop
; AMI password
secret = 123456789

[sip]
; Trunk context match with regex
trunkContextPattern = ^from-trunk
```

Here is currently my `manager.conf` configuration for AMI user
```
[naop]
secret = 123456789
permit=0.0.0.0/0.0.0.0
read = system,call,log,verbose,command,agent,user,config,command,dtmf,reporting,cdr,dialplan,originate,message,agi,all
write = system,call,log,verbose,command,agent,user,config,command,dtmf,reporting,cdr,dialplan,originate,message,agi,all
writetimeout = 5000
```

## Features
* Extensions list
* Status of extensions
* Host of extensions
* Multiple calls tracking extension
* Trunks list
* Extensions & trunks search
* Conference list
* Mute/Unmute conference member

## Features plan
* Admin Page
  * Template
  * Panel
  * Panel member list
  * User
  * Permission
* Extension Panel
  * Voicemail
  * Call pickup
  * Spy
  * Whisper
  * Hangup
  * Blind Transfer
  * Attended Transfer
* Queue Panel
  * Queue list
  * Queue member status
  * Queue stats
* Stats panel

## Screenshot
![alt text](https://raw.githubusercontent.com/yusrilhs/naop/master/ss.gif)

### License
NAOP is licensed under [GPLv3](https://www.gnu.org/licenses/gpl-3.0.html)
