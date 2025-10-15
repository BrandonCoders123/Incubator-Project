<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My GHS Story: The Legend of MUSTARD</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            width: 90%;
        }

        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 30px;
            font-size: 28px;
        }

        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }

        input[type="text"]:focus,
        input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }

        .btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }

        .btn:active {
            transform: translateY(0);
        }

        .guest-btn {
            background: #6c757d;
            margin-top: 10px;
        }

        .guest-btn:hover {
            box-shadow: 0 10px 20px rgba(108, 117, 125, 0.3);
        }

        .toggle-form {
            text-align: center;
            margin-top: 20px;
            color: #666;
        }

        .toggle-form a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }

        .toggle-form a:hover {
            text-decoration: underline;
        }

        .error {
            background: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .success {
            background: #efe;
            border: 1px solid #cfc;
            color: #3c3;
            padding: 10px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌭 The Legend of MUSTARD</h1>
        <p class="subtitle">My GHS Story</p>

        <?php
        $error = '';
        $success = '';
        $isRegister = isset($_POST['register']) || isset($_GET['register']);

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $username = $_POST['username'] ?? '';
            $password = $_POST['password'] ?? '';

            if (empty($username) || empty($password)) {
                $error = 'Please fill in all fields';
            } else {
                $endpoint = isset($_POST['register']) ? '/api/register' : '/api/login';
                
                // Call the API
                $url = 'http://localhost:5000' . $endpoint;
                $data = json_encode(['username' => $username, 'password' => $password]);
                
                $options = [
                    'http' => [
                        'header'  => "Content-Type: application/json\r\n",
                        'method'  => 'POST',
                        'content' => $data,
                    ],
                ];
                
                $context = stream_context_create($options);
                $result = @file_get_contents($url, false, $context);
                
                if ($result === false) {
                    $error = 'Connection error. Please try again.';
                } else {
                    $response = json_decode($result, true);
                    
                    if (isset($http_response_header)) {
                        $status_line = $http_response_header[0];
                        preg_match('{HTTP\/\S*\s(\d{3})}', $status_line, $match);
                        $status = $match[1];
                        
                        if ($status >= 200 && $status < 300) {
                            if (isset($_POST['register'])) {
                                $success = 'Account created! Please login.';
                                $isRegister = false;
                            } else {
                                // Login successful - redirect to game
                                session_start();
                                $_SESSION['username'] = $username;
                                header('Location: /game.php');
                                exit;
                            }
                        } else {
                            $error = $response['error'] ?? 'An error occurred';
                        }
                    }
                }
            }
        }
        ?>

        <?php if ($error): ?>
            <div class="error"><?php echo htmlspecialchars($error); ?></div>
        <?php endif; ?>

        <?php if ($success): ?>
            <div class="success"><?php echo htmlspecialchars($success); ?></div>
        <?php endif; ?>

        <form method="POST" action="/index.php<?php echo $isRegister ? '?register=1' : ''; ?>">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required>
            </div>
            
            <?php if ($isRegister): ?>
                <button type="submit" name="register" class="btn">Register</button>
            <?php else: ?>
                <button type="submit" name="login" class="btn">Login</button>
            <?php endif; ?>
        </form>

        <form method="POST" action="/game.php">
            <button type="submit" name="guest" class="btn guest-btn">Play as Guest</button>
        </form>

        <div class="toggle-form">
            <?php if ($isRegister): ?>
                Already have an account? <a href="/index.php">Login</a>
            <?php else: ?>
                Don't have an account? <a href="/index.php?register=1">Register</a>
            <?php endif; ?>
        </div>
    </div>
</body>
</html>
