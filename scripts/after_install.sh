#!/bin/bash
echo 'run after_install.sh: ' >> /home/ec2-user/project2/deploy.log

echo 'cd /home/ec2-user/nodejs-server-cicd' >> /home/ec2-user/project2/deploy.log
cd /home/ec2-user/project2 >> /home/ec2-user/project2/deploy.log

echo 'npm install' >> /home/ec2-user/project2/deploy.log 
npm install >> /home/ec2-user/project2/deploy.log
