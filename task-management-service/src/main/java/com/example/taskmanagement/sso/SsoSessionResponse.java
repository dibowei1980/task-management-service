package com.example.taskmanagement.sso;

import com.fasterxml.jackson.annotation.JsonProperty;

public class SsoSessionResponse {
    @JsonProperty("session_id")
    private String sessionId;

    private SsoUser user;

    @JsonProperty("expires_at")
    private Long expiresAt;

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public SsoUser getUser() {
        return user;
    }

    public void setUser(SsoUser user) {
        this.user = user;
    }

    public Long getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Long expiresAt) {
        this.expiresAt = expiresAt;
    }
}
