package com.example.taskmanagement.util;

import com.example.taskmanagement.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class TokenDebugUtil {
    private static JwtUtil jwtUtil;

    @Autowired
    public TokenDebugUtil(JwtUtil util) {
        TokenDebugUtil.jwtUtil = util;
    }

    public static String extractUsername(String token) {
        return jwtUtil.extractUsername(token);
    }

    @SuppressWarnings("unchecked")
    public static List<String> extractRoles(String token) {
        return jwtUtil.extractRoles(token);
    }
}
