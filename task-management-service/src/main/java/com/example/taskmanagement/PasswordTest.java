package com.example.taskmanagement;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public class PasswordTest {
    public static void main(String[] args) {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        
        String rawPassword = "yKY0N0XSRREheBkok00gWSEix1OogROHSPv8Uk";
        String bcryptHash = "$2a$10$qEglLJUc7K7hIgY/b/ZDmesWfOHaBFWIDy/jFsSQtCQbyW2YnQhsu";
        
        boolean matches = encoder.matches(rawPassword, bcryptHash);
        System.out.println("========================================");
        System.out.println("Password verification result:");
        System.out.println("Raw password: " + rawPassword);
        System.out.println("BCrypt hash:  " + bcryptHash);
        System.out.println("Matches:      " + matches);
        System.out.println("========================================");
        
        if (!matches) {
            System.out.println("\nGenerating new hash for the password:");
            String newHash = encoder.encode(rawPassword);
            System.out.println("New hash: " + newHash);
        }
    }
}
