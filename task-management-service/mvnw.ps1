<#
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUTHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
#>

<#
.SYNOPSIS
A PowerShell script to run the Maven Wrapper.

.DESCRIPTION
This script is a PowerShell implementation of the Maven Wrapper. It allows you to run Maven builds
without having to install Maven manually.

.LINK
https://github.com/apache/maven-wrapper

.NOTES
This script is intended to be used with the Maven Wrapper.
#>

[CmdletBinding()]
param(
    [string[]] $args
)

$ErrorActionPreference = "Stop"

$mavenProjectBaseDir = (Get-Item -Path $PSScriptRoot).FullName
$wrapperJar = Join-Path $mavenProjectBaseDir ".mvn\wrapper\maven-wrapper.jar"
$wrapperProperties = Join-Path $mavenProjectBaseDir ".mvn\wrapper\maven-wrapper.properties"
$wrapperLauncher = "org.apache.maven.wrapper.MavenWrapperMain"

$distributionUrl = $null
$wrapperUrl = $null
if (Test-Path $wrapperProperties) {
    Get-Content $wrapperProperties | ForEach-Object {
        if ($_ -match "^distributionUrl=(.+)") {
            $distributionUrl = $matches[1]
        }
        if ($_ -match "^wrapperUrl=(.+)") {
            $wrapperUrl = $matches[1]
        }
    }
}

if ($distributionUrl -eq $null) {
    Write-Error "Could not locate distributionUrl in wrapper properties file '$wrapperProperties'."
    exit 1
}

if ($wrapperUrl -eq $null) {
    Write-Error "Could not locate wrapperUrl in wrapper properties file '$wrapperProperties'."
    exit 1
}

if (-not (Test-Path $wrapperJar)) {
    Write-Host "Downloading $wrapperUrl"
    try {
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($wrapperUrl, $wrapperJar)
        Write-Host "Downloaded $wrapperUrl"
    }
    catch {
        Write-Error "Cannot download $wrapperUrl"
        exit 1
    }
}

$mavenOpts = "-Dmaven.multiModuleProjectDirectory=`"$mavenProjectBaseDir`""
$mavenOpts += " `-Dwrapper.jar=`"$wrapperJar`""
$mavenOpts += " `-Dwrapper.properties=`"$wrapperProperties`""

$javaArgs = @($mavenOpts) + @("-cp", $wrapperJar) + @($wrapperLauncher) + @($args)

if ($env:JAVA_HOME) {
    $javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
    & $javaExe $javaArgs
} else {
    & "java" $javaArgs
}
